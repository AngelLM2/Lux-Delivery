import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.models.order import OrderStatus
from app.models.user import User, UserRole
from app.repositories.notification import NotificationRepository
from app.repositories.order import OrderRepository
from app.repositories.product import ProductRepository
from app.schemas.order import OrderCreate, OrderRead, OrderStatusUpdate
from app.services.cache_service import CacheService
from app.config import settings

DEFAULT_STATUS_DESCRIPTIONS = {
    OrderStatus.CREATED: "Pedido criado.",
    OrderStatus.CONFIRMED: "Pedido confirmado.",
    OrderStatus.PREPARING: "Pedido em preparo.",
    OrderStatus.OUT_FOR_DELIVERY: "Pedido saiu para entrega.",
    OrderStatus.DELIVERED: "Pedido entregue.",
    OrderStatus.CANCELED: "Pedido cancelado.",
}

ALLOWED_TRANSITIONS = {
    OrderStatus.CREATED: {OrderStatus.CONFIRMED, OrderStatus.CANCELED},
    OrderStatus.CONFIRMED: {OrderStatus.PREPARING, OrderStatus.CANCELED},
    OrderStatus.PREPARING: {OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELED},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED, OrderStatus.CANCELED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELED: set(),
}


class OrderService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.order_repo = OrderRepository(session)
        self.product_repo = ProductRepository(session)
        self.notification_repo = NotificationRepository(session)
        self.cache = CacheService
        self.ttl = settings.TTL_ORDERS_LIST

    async def create(self, current_user: User, data: OrderCreate):
        if current_user.role not in {UserRole.CUSTOMER, UserRole.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Apenas cliente/admin podem criar pedidos.",
            )
        
        items_payload: list[tuple[int, int, Decimal]] = []
        total_amount = Decimal("0")
        product_ids = list({item.product_id for item in data.items})
        products = await self.product_repo.list_by_ids(product_ids)
        products_by_id = {product.id: product for product in products}

        for item in data.items:
            product = products_by_id.get(item.product_id)
            if not product:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Produto {item.product_id} nao encontrado.",
                )
            items_payload.append((product.id, item.quantity, product.price))
            total_amount += Decimal(str(item.quantity)) * product.price

        order = await self.order_repo.create(
            customer_id=current_user.id,
            delivery_address=data.delivery_address,
            notes=data.notes,
        )
        for product_id, quantity, unit_price in items_payload:
            await self.order_repo.add_item(
                order_id=order.id,
                product_id=product_id,
                quantity=quantity,
                unit_price=unit_price,
            )
        order.total_amount = total_amount
        await self.order_repo.add_tracking_event(
            order_id=order.id,
            status=OrderStatus.CREATED,
            description=DEFAULT_STATUS_DESCRIPTIONS[OrderStatus.CREATED],
            created_by_user_id=current_user.id,
        )
        await self.notification_repo.create(
            user_id=current_user.id,
            order_id=order.id,
            event_type="order_created",
            message=f"Pedido #{order.id} criado com sucesso.",
        )
        result = await self.order_repo.search_by_id(order.id)
        await self.cache.delete(self.cache.key_orders_user(current_user.id, current_user.role.value))
        return result

    async def get_by_id(self, order_id: int, current_user: User):
        order = await self.order_repo.search_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")
        self._ensure_access(order, current_user)
        return order

    async def list_for_user(self, current_user: User, limit: int = 20, cursor: int = 0):
        if current_user.role == UserRole.ADMIN:
            return await self.order_repo.list_all(limit=limit, cursor=cursor)
        if current_user.role == UserRole.CUSTOMER:
            key = self.cache.key_orders_user(current_user.id, current_user.role.value)
            cached = await self.cache.get(key)
            if cached is not None:
                return [OrderRead.model_validate(item) for item in cached]
            orders = await self.order_repo.list_for_user(current_user.id, current_user.role.value)
            payload = [self._serialize_order(order) for order in orders]
            try:
                await self.cache.set(key, payload, self.ttl)
            except Exception as exc:
                logger.exception("Cache set list_for_user falhou: %s", exc)
            return [OrderRead.model_validate(item) for item in payload]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para listar pedidos.",
        )

    async def update_status(self, order_id: int, data: OrderStatusUpdate, current_user: User):
        order = await self.order_repo.search_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido nao encontrado.")

        self._ensure_can_change_status(order, data.status, current_user)
        self._ensure_valid_transition(order.status, data.status)

        order.status = data.status
        self._set_status_timestamp(order, data.status)
        description = data.description or DEFAULT_STATUS_DESCRIPTIONS[data.status]
        await self.order_repo.add_tracking_event(
            order_id=order.id,
            status=data.status,
            description=description,
            created_by_user_id=current_user.id,
        )
        await self.notification_repo.create(
            user_id=order.customer_id,
            order_id=order.id,
            event_type=f"order_{data.status.value}",
            message=f"Pedido #{order.id} agora esta '{data.status.value}'.",
        )
        await self.session.refresh(order, ["items", "tracking_events"])
        await self.cache.delete(self.cache.key_orders_user(order.customer_id, "customer"))
        return order

    async def tracking(self, order_id: int, current_user: User):
        order = await self.get_by_id(order_id, current_user)
        return order.tracking_events

    def _ensure_access(self, order, current_user: User):
        if current_user.role == UserRole.ADMIN:
            return
        if current_user.role == UserRole.CUSTOMER and order.customer_id == current_user.id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissao para acessar este pedido.",
        )

    def _ensure_valid_transition(self, old_status: OrderStatus, new_status: OrderStatus):
        if old_status == new_status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pedido ja esta neste status.",
            )
        if new_status not in ALLOWED_TRANSITIONS.get(old_status, set()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Transicao invalida: {old_status.value} -> {new_status.value}.",
            )

    def _ensure_can_change_status(self, order, new_status: OrderStatus, current_user: User):
        if current_user.role == UserRole.ADMIN:
            return
        if current_user.role == UserRole.CUSTOMER:
            if order.customer_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Pedido nao encontrado.",
                )
            if new_status != OrderStatus.CANCELED:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cliente so pode cancelar pedido.",
                )
            if order.status not in {OrderStatus.CREATED, OrderStatus.CONFIRMED}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Pedido nao pode mais ser cancelado pelo cliente.",
                )

    def _set_status_timestamp(self, order, new_status: OrderStatus):
        now = datetime.now(timezone.utc)
        if new_status == OrderStatus.CONFIRMED:
            order.confirmed_at = now
        elif new_status == OrderStatus.PREPARING:
            order.preparing_at = now
        elif new_status == OrderStatus.OUT_FOR_DELIVERY:
            order.out_for_delivery_at = now
        elif new_status == OrderStatus.DELIVERED:
            order.delivered_at = now
        elif new_status == OrderStatus.CANCELED:
            order.canceled_at = now

    def _serialize_order(self, order) -> dict:
        return OrderRead.model_validate(order).model_dump(mode="json")