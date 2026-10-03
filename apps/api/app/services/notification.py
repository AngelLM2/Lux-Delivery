from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.notification import NotificationRepository


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = NotificationRepository(session)

    async def list_for_user(self, current_user: User, only_unread: bool | None = None):
        return await self.repo.list_by_user(current_user.id, only_unread=only_unread)

    async def mark_as_read(self, notification_id: int, current_user: User):
        notification = await self.repo.mark_read(notification_id, current_user.id)
        if not notification:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Notificacao nao encontrada.",
            )
        return notification
