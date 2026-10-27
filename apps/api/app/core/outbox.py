"""Transactional outbox: events are written in the same transaction as the business change.

app.workers.outbox_relay publishes them to a Redis Stream (at-least-once, so consumers dedupe on
``event_id``). See docs/06-concorrencia-e-consistencia.md §3 and docs/11-backend-architecture-deep-dive.md.

Design Principles:
- Dual-write elimination: application state and outbox events commit in the exact same DB transaction.
- Reactive wakeups: uses PostgreSQL LISTEN/NOTIFY (channel: 'lux_outbox') to trigger relay workers instantly on commit.
- Partial indexing: ix_outbox_events_unpublished ensures sub-millisecond scans regardless of historical table size.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

OUTBOX_CHANNEL = "lux_outbox"


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    # Partial index: the relay only scans unpublished rows, however much history the table holds.
    __table_args__ = (Index("ix_outbox_events_unpublished", "id", postgresql_where=text("published_at IS NULL")),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    aggregate_type: Mapped[str] = mapped_column(String(40), nullable=False)
    aggregate_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(String(500), nullable=True)


async def enqueue_event(
    session: AsyncSession,
    *,
    event_type: str,
    aggregate_type: str,
    aggregate_id: int,
    payload: dict[str, Any],
) -> OutboxEvent:
    event = OutboxEvent(
        event_id=uuid.uuid4(),
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload,
    )
    session.add(event)
    # NOTIFY is transactional: the relay wakes only when this commits; polling is just a fallback.
    await session.execute(text("SELECT pg_notify(:channel, '')"), {"channel": OUTBOX_CHANNEL})
    return event
