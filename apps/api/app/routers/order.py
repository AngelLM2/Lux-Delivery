from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.config import settings
from app.database import get_session
from app.schemas.order import OrderCreate, OrderRead, OrderStatusUpdate, TrackingEventRead
from app.services.order import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = OrderService(session)
    return await service.create(current_user, data)


@router.get("/", response_model=list[OrderRead], status_code=status.HTTP_200_OK)
async def list_orders(
    limit: int = Query(default=20, ge=1, le=settings.PRODUCTS_MAX_PAGE_SIZE),
    cursor: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = OrderService(session)
    return await service.list_for_user(current_user, limit=limit, cursor=cursor)


@router.get("/{order_id}", response_model=OrderRead, status_code=status.HTTP_200_OK)
async def get_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = OrderService(session)
    return await service.get_by_id(order_id, current_user)


@router.patch("/{order_id}/status", response_model=OrderRead, status_code=status.HTTP_200_OK)
async def update_order_status(
    order_id: int,
    data: OrderStatusUpdate,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = OrderService(session)
    return await service.update_status(order_id, data, current_user)


@router.get("/{order_id}/tracking", response_model=list[TrackingEventRead], status_code=status.HTTP_200_OK)
async def list_tracking_events(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    service = OrderService(session)
    return await service.tracking(order_id, current_user)
