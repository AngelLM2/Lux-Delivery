"""Periodic housekeeping. A Postgres advisory lock makes it safe to run N worker replicas:
only the one holding the lock does the work in a given cycle."""

import asyncio
import contextlib
import logging
from datetime import timedelta

from sqlalchemy import delete, text

from app.core.config import settings
from app.core.database import SessionLocal, utcnow
from app.core.outbox import OutboxEvent
from app.modules.identity.models import RefreshToken
from app.modules.ordering.repository import IdempotencyRepository

logger = logging.getLogger(__name__)

_LOCK_ID = 824312
_INTERVAL_SECONDS = 600


async def run_once() -> dict[str, int]:
    async with SessionLocal() as session:
        locked = (await session.execute(text("SELECT pg_try_advisory_xact_lock(:id)"), {"id": _LOCK_ID})).scalar()
        if not locked:
            await session.rollback()
            return {}
        now = utcnow()
        result = {
            "idempotency_keys": await IdempotencyRepository(session).purge_older_than(
                settings.IDEMPOTENCY_KEY_TTL_HOURS
            ),
            "outbox_events": (
                await session.execute(
                    delete(OutboxEvent).where(
                        OutboxEvent.published_at.is_not(None), OutboxEvent.published_at < now - timedelta(days=7)
                    )
                )
            ).rowcount
            or 0,
            "refresh_tokens": (
                await session.execute(delete(RefreshToken).where(RefreshToken.expires_at < now - timedelta(days=30)))
            ).rowcount
            or 0,
        }
        await session.commit()
    if any(result.values()):
        logger.info("maintenance_done", extra=result)
    return result


async def run(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await run_once()
        except Exception as exc:  # noqa: BLE001
            logger.warning("maintenance_failed", extra={"error": str(exc)})
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=_INTERVAL_SECONDS)
