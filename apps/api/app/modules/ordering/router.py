from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.modules.identity.dependencies import Principal, get_principal
from app.modules.ordering.domain import OrderStatus
from app.modules.ordering.schemas import OrderCreate, OrderRead, OrderStatusUpdate, OrderSummaryPage, TrackingEventRead
from app.modules.ordering.service import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post(
    "",
    response_model=OrderRead,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"description": "Replay of a request with the same Idempotency-Key", "model": OrderRead}},
)
async def create_order(
    data: OrderCreate,
    response: Response,
    idempotency_key: str | None = Header(
        default=None,
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="UUID gerado pelo cliente; repetir a requisicao com a mesma chave nao duplica o pedido.",
    ),
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    order, replayed = await OrderService(session).create(principal, data, idempotency_key)
    if replayed:
        response.status_code = status.HTTP_200_OK
        response.headers["Idempotent-Replayed"] = "true"
    return order


@router.get("", response_model=OrderSummaryPage)
async def list_orders(
    limit: int = Query(default=20, ge=1, le=settings.MAX_PAGE_SIZE),
    cursor: str | None = None,
    status_filter: OrderStatus | None = Query(default=None, alias="status"),
    mine: bool = Query(default=False, description="Admins: listar apenas os proprios pedidos"),
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await OrderService(session).list(principal, limit=limit, cursor=cursor, status=status_filter, only_mine=mine)


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(
    order_id: int, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)
):
    return await OrderService(session).get(principal, order_id)


@router.get("/{order_id}/tracking", response_model=list[TrackingEventRead])
async def get_tracking(
    order_id: int, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)
):
    return (await OrderService(session).get(principal, order_id)).tracking_events


@router.patch("/{order_id}/status", response_model=OrderRead)
async def change_status(
    order_id: int,
    data: OrderStatusUpdate,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    return await OrderService(session).change_status(principal, order_id, data)
