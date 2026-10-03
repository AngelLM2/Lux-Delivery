"""Redis Streams consumer groups: each group sees every event, load-balanced across worker replicas.

``XAUTOCLAIM`` rescues a crashed consumer's messages; after ``CONSUMER_MAX_DELIVERIES`` a message goes
to a dead-letter stream. See docs/06-concorrencia-e-consistencia.md §4.
"""

import asyncio
import json
import logging
import os
import socket
from collections.abc import Awaitable, Callable

import asyncpg
from redis.asyncio import Redis
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import RedisError, ResponseError
from redis.exceptions import TimeoutError as RedisTimeoutError
from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError

from app.core.config import settings
from app.core.metrics import EVENTS_CONSUMED
from app.core.redis import new_redis_connection

logger = logging.getLogger(__name__)

Handler = Callable[[str, str, dict], Awaitable[None]]

_CLAIM_IDLE_MS = 30_000
_READ_COUNT = 50
_BLOCK_MS = 5_000


def consumer_name() -> str:
    return f"{socket.gethostname()}-{os.getpid()}"


def dead_letter_stream() -> str:
    return f"{settings.EVENTS_STREAM}:dlq"


async def ensure_group(redis: Redis, group: str) -> None:
    try:
        # "0": a brand-new group starts from the beginning of the retained stream.
        await redis.xgroup_create(settings.EVENTS_STREAM, group, id="0", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


class TransientDependencyError(Exception):
    """A dependency (Postgres, Redis, network) is down: retry later, never dead-letter."""


def is_transient(exc: BaseException) -> bool:
    """Infrastructure failures are not the message's fault.

    Counting them toward CONSUMER_MAX_DELIVERIES would dead-letter every event published during a
    two-minute Postgres outage, and nothing would ever replay them.
    """
    if isinstance(exc, (OSError, asyncio.TimeoutError, RedisConnectionError, RedisTimeoutError)):
        return True
    if isinstance(exc, (OperationalError, InterfaceError)):
        return True
    if isinstance(exc, DBAPIError) and exc.connection_invalidated:
        return True
    return isinstance(exc, (asyncpg.PostgresConnectionError, asyncpg.CannotConnectNowError))


async def _handle_message(redis: Redis, group: str, handler: Handler, message_id: str, fields: dict) -> None:
    try:
        payload = json.loads(fields.get("payload", "{}"))
        await handler(fields["event_id"], fields["event_type"], payload)
    except Exception as exc:
        if is_transient(exc):
            # Leave it pending (no ACK, no dead-letter) and make the caller back off.
            EVENTS_CONSUMED.labels(group, "retry").inc()
            raise TransientDependencyError(str(exc)) from exc
        EVENTS_CONSUMED.labels(group, "error").inc()
        logger.exception("event_handler_failed", extra={"group": group, "message_id": message_id})
        pending = await redis.xpending_range(settings.EVENTS_STREAM, group, min=message_id, max=message_id, count=1)
        deliveries = pending[0]["times_delivered"] if pending else 1
        if deliveries >= settings.CONSUMER_MAX_DELIVERIES:
            await redis.xadd(
                dead_letter_stream(),
                {**fields, "group": group, "error": str(exc)[:500], "original_id": message_id},
                maxlen=10_000,
                approximate=True,
            )
            await redis.xack(settings.EVENTS_STREAM, group, message_id)
            EVENTS_CONSUMED.labels(group, "dead_lettered").inc()
        return
    await redis.xack(settings.EVENTS_STREAM, group, message_id)
    EVENTS_CONSUMED.labels(group, "ok").inc()


async def consume_once(redis: Redis, group: str, handler: Handler, *, block_ms: int | None = None) -> int:
    """Claim stale messages, read new ones and process them. Returns messages handled."""
    name = consumer_name()
    handled = 0

    _, claimed, *_ = await redis.xautoclaim(
        settings.EVENTS_STREAM, group, name, min_idle_time=_CLAIM_IDLE_MS, start_id="0-0", count=_READ_COUNT
    )
    for message_id, fields in claimed:
        if fields:  # entries trimmed from the stream come back empty
            await _handle_message(redis, group, handler, message_id, fields)
            handled += 1

    response = await redis.xreadgroup(group, name, {settings.EVENTS_STREAM: ">"}, count=_READ_COUNT, block=block_ms)
    for _stream, messages in response or []:
        for message_id, fields in messages:
            await _handle_message(redis, group, handler, message_id, fields)
            handled += 1
    return handled


async def run(group: str, handler: Handler, stop: asyncio.Event) -> None:
    backoff = 0.5
    while not stop.is_set():
        redis = new_redis_connection(socket_timeout=None)
        try:
            await ensure_group(redis, group)
            logger.info("consumer_started", extra={"group": group, "consumer": consumer_name()})
            backoff = 0.5
            while not stop.is_set():
                await consume_once(redis, group, handler, block_ms=_BLOCK_MS)
        except (RedisError, OSError, TransientDependencyError) as exc:
            logger.warning("consumer_dependency_error", extra={"group": group, "error": str(exc), "backoff": backoff})
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)
        finally:
            await redis.aclose()
