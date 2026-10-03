"""Realtime fan-out over Redis Pub/Sub: one pattern subscription per process, local SSE queues.

Redis connections stay O(processes), not O(users). Messages are hints; REST is the source of truth,
so a lost message only delays the UI until its next refetch. See docs/02-arquitetura.md §5.3.
"""

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

from redis.exceptions import RedisError

from app.core.redis import get_redis, new_redis_connection

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "lux:rt:"
ADMIN_CHANNEL = f"{CHANNEL_PREFIX}role:admin"
_QUEUE_SIZE = 100


def user_channel(user_id: int) -> str:
    return f"{CHANNEL_PREFIX}user:{user_id}"


async def publish(channel: str, event_type: str, data: dict[str, Any]) -> None:
    message = json.dumps({"type": event_type, "data": data}, default=str)
    try:
        await get_redis().publish(channel, message)
    except RedisError as exc:
        logger.warning("realtime_publish_failed", extra={"channel": channel, "error": str(exc)})


class RealtimeHub:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)
        self._task: asyncio.Task | None = None
        self._ready = asyncio.Event()

    @property
    def connections(self) -> int:
        return len({id(q) for queues in self._subscribers.values() for q in queues})

    @contextlib.asynccontextmanager
    async def subscribe(self, channels: list[str]) -> AsyncIterator[asyncio.Queue[str]]:
        self._ensure_running()
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=_QUEUE_SIZE)
        for channel in channels:
            self._subscribers[channel].add(queue)
        try:
            yield queue
        finally:
            for channel in channels:
                self._subscribers[channel].discard(queue)
                if not self._subscribers[channel]:
                    del self._subscribers[channel]

    def _ensure_running(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run(), name="realtime-hub")

    async def wait_ready(self, timeout: float = 2.0) -> None:
        self._ensure_running()
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self._ready.wait(), timeout)

    async def _run(self) -> None:
        backoff = 0.5
        while True:
            client = new_redis_connection(socket_timeout=None)
            pubsub = client.pubsub()
            try:
                await pubsub.psubscribe(f"{CHANNEL_PREFIX}*")
                self._ready.set()
                backoff = 0.5
                while True:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
                    if message and message.get("type") == "pmessage":
                        self._dispatch(message["channel"], message["data"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - keep the hub alive on any Redis failure
                self._ready.clear()
                logger.warning("realtime_hub_reconnecting", extra={"error": str(exc), "backoff": backoff})
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 10)
            finally:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
                    await client.aclose()

    def _dispatch(self, channel: str, data: str) -> None:
        for queue in list(self._subscribers.get(channel, ())):
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                logger.warning("realtime_slow_consumer_dropped_message", extra={"channel": channel})

    async def close(self) -> None:
        if self._task:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None


hub = RealtimeHub()
