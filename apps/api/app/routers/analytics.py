from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_roles
from app.config import settings
from app.database import get_session
from app.models.user import UserRole
from app.schemas.analytics import OrdersAnalyticsRead
from app.services.analytics import AnalyticsService

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
)


@router.get("/orders-progress", response_model=OrdersAnalyticsRead, status_code=status.HTTP_200_OK)
async def order_progress_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    session: AsyncSession = Depends(get_session),
):
    today = date.today()
    end = end_date or today
    start = start_date or (today - timedelta(days=30))
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date nao pode ser maior que end_date.",
        )
    if (end - start).days > settings.ANALYTICS_MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Periodo maximo permitido e de {settings.ANALYTICS_MAX_RANGE_DAYS} dias.",
        )
    service = AnalyticsService(session)
    return await service.orders_progress(start, end)
