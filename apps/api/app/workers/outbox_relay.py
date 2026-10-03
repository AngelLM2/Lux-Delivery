"""Outbox relay: Postgres ``outbox_events`` -> Redis Stream, woken by LISTEN (polling is a fallback).

``SKIP LOCKED`` lets replicas share the work. XADD runs before the commit that marks rows published,
so a failed commit means a duplicate (consumers dedupe on ``event_id``), never a lost event.
"""

import asyncio
import contextlib
import json
import logging

import asyncpg
from redis.exceptions import RedisError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import SessionLocal, utcnow
from app.core.metrics import OUTBOX_PENDING, OUTBOX_PUBLISHED
from app.core.outbox import OUTBOX_CHANNEL, OutboxEvent
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

_LISTEN_HEALTHCHECK_SECONDS = 10


async def relay_once(session: AsyncSession, batch_size: int | None = None) -> int:
    """Publish one batch. Returns how many events were relayed."""
    batch_size = batch_size or settings.OUTBOX_BATCH_SIZE
    rows = list(
        (
            await session.execute(
                select(OutboxEvent)
                .where(OutboxEvent.published_at.is_(None))
                .order_by(OutboxEvent.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        ).scalars()
    )
    if not rows:
        await session.rollback()
        return 0

    redis = get_redis()
    try:
        async with redis.pipeline(transaction=False) as pipe:
            for event in rows:
                pipe.xadd(
                    settings.EVENTS_STREAM,
                    {
                        "event_id": str(event.event_id),
                        "event_type": event.event_type,
                        "aggregate_id": str(event.aggregate_id),
                        "occurred_at": event.occurred_at.isoformat(),
                        "payload": json.dumps(event.payload, default=str),
                    },
                    maxlen=settings.EVENTS_STREAM_MAXLEN,
                    approximate=True,
                )
            await pipe.execute()
    except RedisError as exc:
        await session.rollback()
        await session.execute(
            update(OutboxEvent)
            .where(OutboxEvent.id.in_([e.id for e in rows]))
            .values(attempts=OutboxEvent.attempts + 1, last_error=str(exc)[:500])
        )
        await session.commit()
        raise

    now = utcnow()
    await session.execute(update(OutboxEvent).where(OutboxEvent.id.in_([e.id for e in rows])).values(published_at=now))
    await session.commit()
    OUTBOX_PUBLISHED.inc(len(rows))
    return len(rows)


async def pending_count(session: AsyncSession) -> int:
    query = select(func.count()).select_from(OutboxEvent).where(OutboxEvent.published_at.is_(None))
    return (await session.execute(query)).scalar_one()


async def _listen(wakeup: asyncio.Event, stop: asyncio.Event) -> None:
    """Dedicated asyncpg connection for LISTEN (needs a session-level connection, so it must
    bypass PgBouncer in transaction mode)."""
    dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
    while not stop.is_set():
        conn = None
        try:
            conn = await asyncpg.connect(dsn)
            lost = asyncio.Event()
            conn.add_termination_listener(lambda _conn, event=lost: event.set())
            await conn.add_listener(OUTBOX_CHANNEL, lambda *_: wakeup.set())
            logger.info("outbox_listen_started")
            # Wait for shutdown, but notice a dropped connection (Postgres restart, failover,
            # pg_terminate_backend): without this the relay silently degraded to polling forever.
            while not stop.is_set() and not lost.is_set():
                await _sleep(lost, stop, _LISTEN_HEALTHCHECK_SECONDS)
                if not stop.is_set() and not lost.is_set():
                    await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=5)
            if lost.is_set():
                logger.warning("outbox_listen_connection_lost")
                wakeup.set()  # poll once now: events may have been committed while we were deaf
        except Exception as exc:  # noqa: BLE001 - fall back to polling and retry LISTEN later
            logger.warning("outbox_listen_failed", extra={"error": str(exc)})
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=5)
        finally:
            if conn is not None:
                with contextlib.suppress(Exception):
                    await conn.close()


async def _sleep(wakeup: asyncio.Event, stop: asyncio.Event, timeout: float) -> None:
    """Sleep until NOTIFY arrives, shutdown is requested or the polling interval elapses."""
    waiters = [asyncio.create_task(wakeup.wait()), asyncio.create_task(stop.wait())]
    try:
        await asyncio.wait(waiters, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for waiter in waiters:
            waiter.cancel()


async def run(stop: asyncio.Event) -> None:
    wakeup = asyncio.Event()
    listener = asyncio.create_task(_listen(wakeup, stop), name="outbox-listen")
    backoff = 0.5
    try:
        while not stop.is_set():
            # Cleared *before* reading: a NOTIFY that arrives while we relay is not lost.
            wakeup.clear()
            try:
                async with SessionLocal() as session:
                    relayed = await relay_once(session)
                    if relayed == 0:
                        OUTBOX_PENDING.set(await pending_count(session))
                backoff = 0.5
                if relayed:
                    continue  # drain the backlog before sleeping
            except Exception as exc:  # noqa: BLE001
                logger.warning("outbox_relay_error", extra={"error": str(exc), "backoff": backoff})
                await _sleep(asyncio.Event(), stop, backoff)
                backoff = min(backoff * 2, 30)
                continue
            await _sleep(wakeup, stop, settings.OUTBOX_POLL_INTERVAL_SECONDS)
    finally:
        listener.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await listener
