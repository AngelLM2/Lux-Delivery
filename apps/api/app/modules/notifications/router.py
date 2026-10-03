from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.modules.identity.dependencies import Principal, get_principal
from app.modules.notifications.schemas import MarkAllResult, NotificationPage, NotificationRead, UnreadCount
from app.modules.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationPage)
async def list_notifications(
    limit: int = Query(default=20, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = None,
    only_unread: bool = False,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await NotificationService(session).list(principal.id, limit=limit, cursor=cursor, only_unread=only_unread)


@router.get("/unread-count", response_model=UnreadCount)
async def unread_count(principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    return UnreadCount(unread=await NotificationService(session).unread_count(principal.id))


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: int,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await NotificationService(session).mark_read(principal.id, notification_id)


@router.post("/read-all", response_model=MarkAllResult)
async def mark_all_read(principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    return MarkAllResult(updated=await NotificationService(session).mark_all_read(principal.id))
