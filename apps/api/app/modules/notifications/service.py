import uuid

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound
from app.core.pagination import cursor_created_id, encode_cursor
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationPage, NotificationRead


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, user_id: int, *, limit: int, cursor: str | None, only_unread: bool) -> NotificationPage:
        query = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit + 1)
        )
        if only_unread:
            query = query.where(Notification.is_read.is_(False))
        after = cursor_created_id(cursor)
        if after:
            # Row-value comparison keeps the cursor an index condition (see ordering/repository.py).
            query = query.where(tuple_(Notification.created_at, Notification.id) < tuple_(*after))
        rows = list((await self.session.execute(query)).scalars())
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = (
            encode_cursor({"c": rows[-1].created_at.isoformat(), "i": rows[-1].id}) if has_more and rows else None
        )
        return NotificationPage(items=[NotificationRead.model_validate(n) for n in rows], next_cursor=next_cursor)

    async def unread_count(self, user_id: int) -> int:
        query = select(func.count()).where(Notification.user_id == user_id, Notification.is_read.is_(False))
        return (await self.session.execute(query)).scalar_one()

    async def mark_read(self, user_id: int, notification_id: int) -> Notification:
        notification = await self.session.get(Notification, notification_id)
        if notification is None or notification.user_id != user_id:
            raise NotFound("Notificacao nao encontrada.", code="notification_not_found")
        notification.is_read = True
        await self.session.commit()
        return notification

    async def mark_all_read(self, user_id: int) -> int:
        result = await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
        await self.session.commit()
        return result.rowcount or 0

    async def create_from_event(
        self, *, event_id: uuid.UUID, user_id: int, order_id: int | None, event_type: str, message: str
    ) -> Notification | None:
        """Idempotent insert keyed by the source event (at-least-once delivery upstream)."""
        stmt = (
            insert(Notification)
            .values(
                user_id=user_id,
                order_id=order_id,
                event_type=event_type,
                message=message,
                source_event_id=event_id,
            )
            .on_conflict_do_nothing(index_elements=["source_event_id"])
            .returning(Notification)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()
