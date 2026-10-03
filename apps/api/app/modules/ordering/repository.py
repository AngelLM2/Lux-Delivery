from datetime import datetime, timedelta

from sqlalchemy import delete, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import utcnow
from app.modules.ordering.domain import OrderStatus
from app.modules.ordering.models import IdempotencyKey, Order, OrderItem, OrderTrackingEvent


class OrderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def add(self, order: Order) -> Order:
        self.session.add(order)
        await self.session.flush()
        return order

    async def get_detail(self, order_id: int) -> Order | None:
        # selectinload issues one extra query per collection instead of a JOIN that multiplies
        # rows (items x events) — cheaper and avoids .unique() gymnastics.
        query = (
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items), selectinload(Order.tracking_events))
            .execution_options(populate_existing=True)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def get_for_update(self, order_id: int) -> Order | None:
        """Row lock serialising concurrent transitions; the second re-validates against the new status.

        selectinload runs separate SELECTs, so FOR UPDATE locks only the order row (OF orders).
        """
        query = (
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items), selectinload(Order.tracking_events))
            .with_for_update(of=Order)
            .execution_options(populate_existing=True)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def list_page(
        self,
        *,
        limit: int,
        customer_id: int | None,
        status: OrderStatus | None,
        after: tuple[datetime, int] | None,
    ) -> list[Order]:
        query = (
            select(Order)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
        )
        if customer_id is not None:
            query = query.where(Order.customer_id == customer_id)
        if status is not None:
            query = query.where(Order.status == status)
        if after is not None:
            # Row-value comparison becomes an index condition; "a < x OR (a = x AND b < y)" is not
            # sargable (EXPLAIN showed a scan + filter). See docs/03-modelagem-de-dados.md §5.
            query = query.where(tuple_(Order.created_at, Order.id) < tuple_(*after))
        return list((await self.session.execute(query)).scalars())


class IdempotencyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def claim(self, user_id: int, key: str, request_hash: str) -> bool:
        """True if this request owns the key; False if another request already used it."""
        stmt = (
            insert(IdempotencyKey)
            .values(user_id=user_id, key=key, request_hash=request_hash)
            .on_conflict_do_nothing(constraint="uq_idempotency_keys_user_key")
            .returning(IdempotencyKey.id)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def get(self, user_id: int, key: str) -> IdempotencyKey | None:
        query = select(IdempotencyKey).where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
        return (await self.session.execute(query)).scalar_one_or_none()

    async def attach_order(self, user_id: int, key: str, order_id: int) -> None:
        await self.session.execute(
            update(IdempotencyKey)
            .where(IdempotencyKey.user_id == user_id, IdempotencyKey.key == key)
            .values(order_id=order_id)
        )

    async def purge_older_than(self, hours: int) -> int:
        result = await self.session.execute(
            delete(IdempotencyKey).where(IdempotencyKey.created_at < utcnow() - timedelta(hours=hours))
        )
        return result.rowcount or 0


def new_item(product_id: int, name: str, quantity: int, unit_price, total) -> OrderItem:
    return OrderItem(
        product_id=product_id,
        product_name=name,
        quantity=quantity,
        unit_price=unit_price,
        total_price=total,
    )


def new_tracking_event(status: OrderStatus, description: str, user_id: int | None) -> OrderTrackingEvent:
    # created_at is set in Python (not only by the server default) so the object can be
    # serialised right after the commit without a refresh.
    return OrderTrackingEvent(status=status, description=description, created_by_user_id=user_id, created_at=utcnow())
