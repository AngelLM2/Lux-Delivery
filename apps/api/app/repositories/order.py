from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.order import Order, OrderItem, OrderStatus, OrderTrackingEvent


class OrderRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, customer_id: int, delivery_address: str, notes: str | None) -> Order:
        order = Order(customer_id=customer_id, delivery_address=delivery_address, notes=notes)
        self.session.add(order)
        await self.session.flush()
        return order

    async def add_item(self, order_id: int, product_id: int, quantity: int, unit_price: float) -> OrderItem:
        total_price = quantity * unit_price
        item = OrderItem(
            order_id=order_id,
            product_id=product_id,
            quantity=quantity,
            unit_price=unit_price,
            total_price=total_price,
        )
        self.session.add(item)
        return item

    async def add_tracking_event(
        self,
        order_id: int,
        status: OrderStatus,
        description: str,
        created_by_user_id: int | None,
    ) -> OrderTrackingEvent:
        event = OrderTrackingEvent(
            order_id=order_id,
            status=status,
            description=description,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(event)
        return event

    async def search_by_id(self, order_id: int) -> Order | None:
        result = await self.session.execute(
            select(Order)
            .options(joinedload(Order.items), joinedload(Order.tracking_events))
            .filter(Order.id == order_id)
        )
        return result.unique().scalars().first()

    async def list_for_user(self, user_id: int, role: str) -> list[Order]:
        if role != "customer":
            return []
        query = (
            select(Order)
            .options(joinedload(Order.items), joinedload(Order.tracking_events))
            .filter(Order.customer_id == user_id)
        )
        query = query.order_by(Order.created_at.desc())
        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def list_all(self, limit: int = 20, cursor: int = 0) -> list[Order]:
        query = (
            select(Order)
            .options(joinedload(Order.items), joinedload(Order.tracking_events))
            .order_by(Order.id.asc())
            .limit(limit)
        )
        if cursor > 0:
            query = query.filter(Order.id > cursor)
        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def list_for_period(self, start_at: datetime, end_at: datetime) -> list[Order]:
        result = await self.session.execute(
            select(Order)
            .filter(Order.created_at >= start_at, Order.created_at <= end_at)
            .order_by(Order.created_at.desc())
        )
        return result.scalars().all()
