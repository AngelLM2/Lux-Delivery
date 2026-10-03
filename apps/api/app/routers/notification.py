from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.database import get_session
from app.schemas.notification import NotificationRead
from app.services.notification import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=list[NotificationRead], status_code=status.HTTP_200_OK)
async def list_notifications(
    only_unread: bool | None = None,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = NotificationService(session)
    return await service.list_for_user(current_user, only_unread=only_unread)


@router.patch("/{notification_id}/read", response_model=NotificationRead, status_code=status.HTTP_200_OK)
async def mark_notification_as_read(
    notification_id: int,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = NotificationService(session)
    return await service.mark_as_read(notification_id, current_user)
