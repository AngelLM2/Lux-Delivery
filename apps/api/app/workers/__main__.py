"""Background worker: ``python -m app.workers``.

Runs in its own process/container so slow background work never competes with HTTP latency,
and so it can be scaled independently of the API.
"""

import asyncio
import contextlib
import logging
import signal

from prometheus_client import start_http_server

import app.models  # noqa: F401 - register every model on the metadata
from app.core.config import settings
from app.core.database import engine
from app.core.logging import configure_logging
from app.core.redis import close_redis
from app.modules.notifications import consumer as notifications_consumer
from app.modules.realtime import consumer as realtime_consumer
from app.workers import consumer, maintenance, outbox_relay

logger = logging.getLogger("lux.worker")

CONSUMER_GROUPS = {
    "notifications": notifications_consumer.handle,
    "realtime": realtime_consumer.handle,
}


async def main() -> None:
    configure_logging(settings.LOG_LEVEL, settings.LOG_JSON)
    start_http_server(settings.WORKER_METRICS_PORT)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):  # Windows
            loop.add_signal_handler(sig, stop.set)

    tasks = [
        asyncio.create_task(outbox_relay.run(stop), name="outbox-relay"),
        asyncio.create_task(maintenance.run(stop), name="maintenance"),
        *[
            asyncio.create_task(consumer.run(group, handler, stop), name=f"consumer-{group}")
            for group, handler in CONSUMER_GROUPS.items()
        ],
    ]
    logger.info("worker_started", extra={"tasks": [t.get_name() for t in tasks]})
    try:
        await stop.wait()
    finally:
        logger.info("worker_stopping")
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await close_redis()
        await engine.dispose()


if __name__ == "__main__":
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(main())
