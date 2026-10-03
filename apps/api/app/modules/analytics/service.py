"""Order analytics aggregated inside Postgres: a few rows back, whatever the volume.

At scale this moves to worker-maintained rollups (docs/07-escalabilidade/06-estagio-5-100k-a-1m-usuarios.md §2).
"""

from datetime import date

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import cache
from app.core.config import settings
from app.modules.analytics.schemas import OrdersAnalytics

_RANGE = """
    created_at >= (CAST(:start AS date)::timestamp AT TIME ZONE :tz)
    AND created_at < ((CAST(:end AS date) + 1)::timestamp AT TIME ZONE :tz)
"""


def _duration(expr: str, name: str) -> str:
    minutes = f"(extract(epoch FROM {expr}) / 60.0)"
    return (
        f"avg({minutes}) AS {name}_avg, "
        f"percentile_cont(0.5) WITHIN GROUP (ORDER BY {minutes}) AS {name}_p50, "
        f"percentile_cont(0.9) WITHIN GROUP (ORDER BY {minutes}) AS {name}_p90"
    )


_SUMMARY = f"""
SELECT
    count(*) AS total,
    count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
    count(*) FILTER (WHERE status = 'CANCELED') AS canceled,
    coalesce(sum(total_amount) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue,
    {_duration("confirmed_at - created_at", "confirm")},
    {_duration("out_for_delivery_at - confirmed_at", "dispatch")},
    {_duration("delivered_at - out_for_delivery_at", "deliver")},
    {_duration("delivered_at - created_at", "e2e")}
FROM orders
WHERE {_RANGE}
"""

_BY_STATUS = f"SELECT lower(status::text) AS status, count(*) AS count FROM orders WHERE {_RANGE} GROUP BY 1"

_DAILY = f"""
WITH daily AS (
    SELECT (created_at AT TIME ZONE :tz)::date AS day,
           count(*) AS orders,
           count(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
           coalesce(sum(total_amount) FILTER (WHERE status = 'DELIVERED'), 0) AS revenue
    FROM orders
    WHERE {_RANGE}
    GROUP BY 1
)
SELECT s.day::date AS day,
       coalesce(d.orders, 0) AS orders,
       coalesce(d.delivered, 0) AS delivered,
       coalesce(d.revenue, 0) AS revenue
FROM generate_series(CAST(:start AS date), CAST(:end AS date), interval '1 day') AS s(day)
LEFT JOIN daily d ON d.day = s.day::date
ORDER BY 1
"""

_TOP_PRODUCTS = """
SELECT oi.product_id,
       max(oi.product_name) AS name,
       sum(oi.quantity) AS quantity,
       sum(oi.total_price) AS revenue
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.created_at >= (CAST(:start AS date)::timestamp AT TIME ZONE :tz)
  AND o.created_at < ((CAST(:end AS date) + 1)::timestamp AT TIME ZONE :tz)
  AND o.status <> 'CANCELED'
GROUP BY oi.product_id
ORDER BY quantity DESC, revenue DESC
LIMIT 5
"""


def _stats(row, name: str) -> dict:
    def r(value):
        return None if value is None else round(float(value), 1)

    return {"avg": r(row[f"{name}_avg"]), "p50": r(row[f"{name}_p50"]), "p90": r(row[f"{name}_p90"])}


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def orders(self, start: date, end: date) -> dict:
        params = {"start": start, "end": end, "tz": settings.BUSINESS_TIMEZONE}

        async def load() -> dict:
            # Reports may legitimately take longer than the global 5 s statement timeout that
            # protects transactional routes; widen it for this transaction only.
            await self.session.execute(text("SET LOCAL statement_timeout = '15s'"))
            summary = (await self.session.execute(text(_SUMMARY), params)).mappings().one()
            by_status = (await self.session.execute(text(_BY_STATUS), params)).mappings().all()
            daily = (await self.session.execute(text(_DAILY), params)).mappings().all()
            top = (await self.session.execute(text(_TOP_PRODUCTS), params)).mappings().all()

            total = summary["total"]
            delivered = summary["delivered"]
            revenue = float(summary["revenue"])
            counts = {row["status"]: row["count"] for row in by_status}
            result = OrdersAnalytics(
                period_start=start,
                period_end=end,
                timezone=settings.BUSINESS_TIMEZONE,
                total_orders=total,
                delivered_orders=delivered,
                canceled_orders=summary["canceled"],
                cancel_rate=round(summary["canceled"] / total, 4) if total else 0.0,
                revenue=round(revenue, 2),
                average_ticket=round(revenue / delivered, 2) if delivered else None,
                minutes_to_confirm=_stats(summary, "confirm"),
                minutes_to_dispatch=_stats(summary, "dispatch"),
                minutes_to_deliver=_stats(summary, "deliver"),
                minutes_end_to_end=_stats(summary, "e2e"),
                status_breakdown=[
                    {"status": s, "count": counts.get(s, 0)}
                    for s in ("created", "confirmed", "preparing", "out_for_delivery", "delivered", "canceled")
                ],
                daily=[
                    {
                        "day": r["day"],
                        "orders": r["orders"],
                        "delivered": r["delivered"],
                        "revenue": float(r["revenue"]),
                    }
                    for r in daily
                ],
                top_products=[
                    {
                        "product_id": r["product_id"],
                        "name": r["name"],
                        "quantity": int(r["quantity"]),
                        "revenue": float(r["revenue"]),
                    }
                    for r in top
                ],
            )
            return result.model_dump(mode="json")

        return await cache.cached("analytics", f"orders:{start}:{end}", settings.TTL_ANALYTICS, load)
