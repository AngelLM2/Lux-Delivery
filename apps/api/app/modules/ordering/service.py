import hashlib
import json
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import utcnow
from app.core.errors import Conflict, Forbidden, NotFound, UnprocessableEntity
from app.core.metrics import IDEMPOTENT_REPLAYS, ORDER_TRANSITIONS, ORDERS_CREATED
from app.core.outbox import enqueue_event
from app.core.pagination import cursor_created_id, encode_cursor
from app.modules.catalog.public import get_orderable_products
from app.modules.identity.dependencies import Principal
from app.modules.ordering import domain
from app.modules.ordering.domain import OrderStatus
from app.modules.ordering.models import Order
from app.modules.ordering.repository import IdempotencyRepository, OrderRepository, new_item, new_tracking_event
from app.modules.ordering.schemas import OrderCreate, OrderStatusUpdate, OrderSummary, OrderSummaryPage


def request_fingerprint(data: OrderCreate) -> str:
    """Computes a deterministic SHA-256 fingerprint for idempotency deduplication.
    
    Serializes sorted line items, notes, and delivery address into canonical JSON
    so that whitespace or key-ordering variations do not affect hash consistency.
    """
    canonical = {
        "delivery_address": data.delivery_address,
        "notes": data.notes,
        "items": sorted((i.product_id, i.quantity) for i in data.items),
    }
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()


class OrderService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.orders = OrderRepository(session)
        self.idempotency = IdempotencyRepository(session)

    async def create(self, principal: Principal, data: OrderCreate, idempotency_key: str | None) -> tuple[Order, bool]:
        """Orchestrates order creation with idempotency, domain validation, and transactional outbox.
        
        Args:
            principal: Authenticated customer or administrator.
            data: Order payload containing delivery address, notes, and line items.
            idempotency_key: Optional client-provided unique UUID/token to guarantee once-only creation.
            
        Returns:
            Tuple of (Order instance, is_replayed: bool).
            
        Raises:
            UnprocessableEntity: When requested items are missing or marked unavailable in catalog.
            Conflict: When an idempotency key conflict occurs with concurrent requests.
        """
        if idempotency_key:
            fingerprint = request_fingerprint(data)
            if not await self.idempotency.claim(principal.id, idempotency_key, fingerprint):
                return await self._replay(principal, idempotency_key, fingerprint), True

        lines = domain.merge_lines(domain.LineInput(i.product_id, i.quantity) for i in data.items)
        products = await get_orderable_products(self.session, [line.product_id for line in lines])
        missing = [line.product_id for line in lines if line.product_id not in products]
        if missing:
            raise UnprocessableEntity(f"Produtos inexistentes: {missing}.", code="product_not_found")
        unavailable = [products[line.product_id].name for line in lines if not products[line.product_id].is_available]
        if unavailable:
            raise UnprocessableEntity(
                f"Indisponiveis no momento: {', '.join(unavailable)}.", code="product_unavailable"
            )

        # Built in memory and written by a single flush; the response is rendered from these objects,
        # so there is no second round of SELECTs after the commit.
        items = []
        total = Decimal("0")
        for line in lines:
            product = products[line.product_id]
            line_total = domain.line_total(product.price, line.quantity)
            total += line_total
            items.append(new_item(product.id, product.name, line.quantity, product.price, line_total))
        order = Order(
            customer_id=principal.id,
            delivery_address=data.delivery_address,
            notes=data.notes,
            status=OrderStatus.CREATED,
            total_amount=total,
            items=items,
            tracking_events=[
                new_tracking_event(OrderStatus.CREATED, domain.DEFAULT_DESCRIPTIONS[OrderStatus.CREATED], principal.id)
            ],
        )
        await self.orders.add(order)
        await enqueue_event(
            self.session,
            event_type="order.created",
            aggregate_type="order",
            aggregate_id=order.id,
            payload={
                "order_id": order.id,
                "customer_id": principal.id,
                "status": OrderStatus.CREATED.value,
                "total_amount": str(total),
                "item_count": sum(line.quantity for line in lines),
            },
        )
        if idempotency_key:
            await self.idempotency.attach_order(principal.id, idempotency_key, order.id)
        await self.session.commit()
        ORDERS_CREATED.inc()
        return order, False

    async def _replay(self, principal: Principal, key: str, fingerprint: str) -> Order:
        record = await self.idempotency.get(principal.id, key)
        if record is None:  # purged between claim and read: extremely unlikely, be explicit
            raise Conflict("Idempotency-Key expirada. Tente novamente.", code="idempotency_key_expired")
        if record.request_hash != fingerprint:
            raise UnprocessableEntity("Idempotency-Key ja usada com outro conteudo.", code="idempotency_key_mismatch")
        if record.order_id is None:
            raise Conflict("Requisicao ainda em processamento.", code="idempotency_in_progress")
        IDEMPOTENT_REPLAYS.inc()
        return await self._detail(record.order_id)

    async def get(self, principal: Principal, order_id: int) -> Order:
        order = await self.orders.get_detail(order_id)
        # 404 (not 403) for someone else's order: do not confirm that the id exists (IDOR).
        if order is None or (not principal.is_admin and order.customer_id != principal.id):
            raise NotFound("Pedido nao encontrado.", code="order_not_found")
        return order

    async def list(
        self,
        principal: Principal,
        *,
        limit: int,
        cursor: str | None,
        status: OrderStatus | None,
        only_mine: bool,
    ) -> OrderSummaryPage:
        after = cursor_created_id(cursor)
        customer_id = principal.id if (only_mine or not principal.is_admin) else None
        rows = await self.orders.list_page(limit=limit + 1, customer_id=customer_id, status=status, after=after)
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = (
            encode_cursor({"c": rows[-1].created_at.isoformat(), "i": rows[-1].id}) if has_more and rows else None
        )
        return OrderSummaryPage(items=[OrderSummary.model_validate(o) for o in rows], next_cursor=next_cursor)

    async def change_status(self, principal: Principal, order_id: int, data: OrderStatusUpdate) -> Order:
        order = await self.orders.get_for_update(order_id)
        if order is None or (not principal.is_admin and order.customer_id != principal.id):
            raise NotFound("Pedido nao encontrado.", code="order_not_found")

        actor = domain.Actor(user_id=principal.id, is_admin=principal.is_admin)
        try:
            domain.ensure_transition(order.status, data.status, actor, order.customer_id)
        except domain.TransitionNotAllowed as exc:
            raise Forbidden(str(exc), code=exc.code) from None
        except domain.InvalidTransition as exc:
            raise Conflict(str(exc), code=exc.code) from None

        previous = order.status
        order.status = data.status
        setattr(order, domain.TIMESTAMP_FIELD[data.status], utcnow())
        description = data.description or domain.DEFAULT_DESCRIPTIONS[data.status]
        order.tracking_events.append(new_tracking_event(data.status, description, principal.id))
        await enqueue_event(
            self.session,
            event_type="order.status_changed",
            aggregate_type="order",
            aggregate_id=order.id,
            payload={
                "order_id": order.id,
                "customer_id": order.customer_id,
                "from": previous.value,
                "to": data.status.value,
                "description": description,
                "changed_by": principal.id,
            },
        )
        await self.session.commit()
        ORDER_TRANSITIONS.labels(data.status.value).inc()
        return order

    async def _detail(self, order_id: int) -> Order:
        order = await self.orders.get_detail(order_id)
        if order is None:
            raise NotFound("Pedido nao encontrado.", code="order_not_found")
        return order
