from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_read_session
from app.core.errors import BadRequest
from app.modules.analytics.schemas import OrdersAnalytics
from app.modules.analytics.service import AnalyticsService
from app.modules.identity.dependencies import Principal, require_admin

router = APIRouter(prefix="/analytics", tags=["analytics"])

_MIN_DATE = date(2000, 1, 1)
_MAX_DATE = date(2100, 12, 31)


@router.get("/orders", response_model=OrdersAnalytics)
async def orders_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    _: Principal = Depends(require_admin),
    session: AsyncSession = Depends(get_read_session),
):
    for value in (start_date, end_date):
        if value is not None and not _MIN_DATE <= value <= _MAX_DATE:
            raise BadRequest("Datas devem estar entre 2000-01-01 e 2100-12-31.", code="invalid_range")
    today = datetime.now(ZoneInfo(settings.BUSINESS_TIMEZONE)).date()
    end = end_date or today
    start = start_date or end - timedelta(days=29)
    if start > end:
        raise BadRequest("start_date nao pode ser maior que end_date.", code="invalid_range")
    if (end - start).days > settings.ANALYTICS_MAX_RANGE_DAYS:
        raise BadRequest(
            f"Periodo maximo permitido e de {settings.ANALYTICS_MAX_RANGE_DAYS} dias.", code="range_too_large"
        )
    return await AnalyticsService(session).orders(start, end)
