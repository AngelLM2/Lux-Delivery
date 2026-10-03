from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import insert

from app.core.config import settings
from app.core.database import SessionLocal
from app.modules.ordering.domain import OrderStatus
from app.modules.ordering.models import Order, OrderItem
from tests.conftest import API, create_product

pytestmark = pytest.mark.integration

TZ = ZoneInfo(settings.BUSINESS_TIMEZONE)


async def _insert_order(customer_id, product, *, day: date, hour: int, status: OrderStatus, total: str, minutes: int):
    created = datetime(day.year, day.month, day.day, hour, tzinfo=TZ).astimezone(UTC)
    values = {
        "customer_id": customer_id,
        "status": status,
        "total_amount": Decimal(total),
        "delivery_address": "Rua X, 1",
        "created_at": created,
        "updated_at": created,
    }
    if status == OrderStatus.DELIVERED:
        values |= {
            "confirmed_at": created + timedelta(minutes=2),
            "out_for_delivery_at": created + timedelta(minutes=20),
            "delivered_at": created + timedelta(minutes=minutes),
        }
    if status == OrderStatus.CANCELED:
        values["canceled_at"] = created + timedelta(minutes=3)
    async with SessionLocal() as session:
        order_id = (await session.execute(insert(Order).values(**values).returning(Order.id))).scalar_one()
        await session.execute(
            insert(OrderItem).values(
                order_id=order_id,
                product_id=product["id"],
                product_name=product["name"],
                quantity=2,
                unit_price=Decimal(total) / 2,
                total_price=Decimal(total),
            )
        )
        await session.commit()


async def test_analytics_aggregates_in_the_business_timezone(admin, customer):
    client, _ = admin
    product = await create_product(client, name="Pizza")
    day1, day2 = date(2026, 9, 1), date(2026, 9, 2)
    cid = customer[1].id
    await _insert_order(cid, product, day=day1, hour=12, status=OrderStatus.DELIVERED, total="100.00", minutes=30)
    await _insert_order(cid, product, day=day1, hour=20, status=OrderStatus.DELIVERED, total="50.00", minutes=40)
    await _insert_order(cid, product, day=day2, hour=13, status=OrderStatus.DELIVERED, total="30.00", minutes=50)
    await _insert_order(cid, product, day=day2, hour=23, status=OrderStatus.CANCELED, total="80.00", minutes=0)
    # 23h in Sao Paulo is already the next day in UTC: it must still count as day2.

    response = await client.get(
        f"{API}/analytics/orders", params={"start_date": "2026-09-01", "end_date": "2026-09-03"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_orders"] == 4
    assert data["delivered_orders"] == 3 and data["canceled_orders"] == 1
    assert data["revenue"] == 180.0
    assert data["average_ticket"] == 60.0
    assert data["cancel_rate"] == 0.25
    assert data["minutes_end_to_end"]["p50"] == 40.0
    assert data["minutes_to_confirm"]["avg"] == 2.0
    assert [(d["day"], d["orders"], d["revenue"]) for d in data["daily"]] == [
        ("2026-09-01", 2, 150.0),
        ("2026-09-02", 2, 30.0),
        ("2026-09-03", 0, 0.0),  # empty days are present (generate_series)
    ]
    breakdown = {s["status"]: s["count"] for s in data["status_breakdown"]}
    assert breakdown["delivered"] == 3 and breakdown["canceled"] == 1 and breakdown["created"] == 0
    assert data["top_products"][0]["name"] == "Pizza" and data["top_products"][0]["quantity"] == 6


async def test_analytics_is_admin_only_and_validates_range(admin, customer):
    client, _ = admin
    assert (await customer[0].get(f"{API}/analytics/orders")).status_code == 403
    inverted = await client.get(
        f"{API}/analytics/orders", params={"start_date": "2026-09-10", "end_date": "2026-09-01"}
    )
    assert inverted.status_code == 400
    too_long = await client.get(
        f"{API}/analytics/orders", params={"start_date": "2024-01-01", "end_date": "2026-09-01"}
    )
    assert too_long.status_code == 400
    default = await client.get(f"{API}/analytics/orders")
    assert default.status_code == 200 and len(default.json()["daily"]) == 30
