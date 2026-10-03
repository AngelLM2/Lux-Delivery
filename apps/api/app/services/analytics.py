from datetime import date, datetime, time, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import OrderStatus
from app.repositories.order import OrderRepository


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.repo = OrderRepository(session)

    async def orders_progress(self, start_date: date, end_date: date):
        start_at = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        end_at = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        orders = await self.repo.list_for_period(start_at, end_at)

        status_counts: dict[str, int] = {status.value: 0 for status in OrderStatus}
        confirm_minutes: list[float] = []
        dispatch_minutes: list[float] = []
        deliver_minutes: list[float] = []

        delivered_orders = 0
        canceled_orders = 0

        for order in orders:
            status_counts[order.status.value] += 1
            if order.status == OrderStatus.DELIVERED:
                delivered_orders += 1
            if order.status == OrderStatus.CANCELED:
                canceled_orders += 1

            if order.confirmed_at:
                confirm_minutes.append((order.confirmed_at - order.created_at).total_seconds() / 60)
            if order.confirmed_at and order.out_for_delivery_at:
                dispatch_minutes.append((order.out_for_delivery_at - order.confirmed_at).total_seconds() / 60)
            if order.out_for_delivery_at and order.delivered_at:
                deliver_minutes.append((order.delivered_at - order.out_for_delivery_at).total_seconds() / 60)

        breakdown = [{"status": status, "count": count} for status, count in status_counts.items()]
        return {
            "period_start": str(start_date),
            "period_end": str(end_date),
            "total_orders": len(orders),
            "delivered_orders": delivered_orders,
            "canceled_orders": canceled_orders,
            "avg_minutes_to_confirm": _avg(confirm_minutes),
            "avg_minutes_to_dispatch": _avg(dispatch_minutes),
            "avg_minutes_to_deliver": _avg(deliver_minutes),
            "status_breakdown": breakdown,
        }


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)
