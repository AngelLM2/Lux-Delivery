from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


class NotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_id: int, order_id: int, event_type: str, message: str) -> Notification:
        notification = Notification(
            user_id=user_id,
            order_id=order_id,
            event_type=event_type,
            message=message,
        )
        self.session.add(notification)
        return notification

    async def list_by_user(self, user_id: int, only_unread: bool | None = None) -> list[Notification]:
        query = select(Notification).filter(Notification.user_id == user_id)
        if only_unread is True:
            query = query.filter(Notification.is_read.is_(False))
        elif only_unread is False:
            query = query.filter(Notification.is_read.is_(True))
        query = query.order_by(Notification.created_at.desc())
        result = await self.session.execute(query)
        return result.scalars().all()

    async def mark_read(self, notification_id: int, user_id: int) -> Notification | None:
        result = await self.session.execute(
            select(Notification).filter(Notification.id == notification_id, Notification.user_id == user_id)
        )
        notification = result.scalars().first()
        if not notification:
            return None
        notification.is_read = True
        await self.session.flush()
        await self.session.refresh(notification)
        return notification
