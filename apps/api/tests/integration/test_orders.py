import asyncio
import uuid

import pytest
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.core.outbox import OutboxEvent
from app.modules.ordering.models import Order
from tests.conftest import API, create_product, place_order

pytestmark = pytest.mark.integration


async def _orders_in_db() -> int:
    async with SessionLocal() as session:
        return (await session.execute(select(func.count()).select_from(Order))).scalar_one()


async def _outbox_types() -> list[str]:
    async with SessionLocal() as session:
        return list((await session.execute(select(OutboxEvent.event_type).order_by(OutboxEvent.id))).scalars())


async def test_order_totals_use_exact_decimal_math(admin, customer):
    admin_client, _ = admin
    client, user = customer
    a = await create_product(admin_client, price="33.33")
    b = await create_product(admin_client, price="0.10")
    response = await place_order(client, [(a["id"], 3), (b["id"], 3)])
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total_amount"] == 100.29  # 99.99 + 0.30, no float drift
    assert order["status"] == "created" and order["customer_id"] == user.id
    assert [e["status"] for e in order["tracking_events"]] == ["created"]
    assert await _outbox_types() == ["order.created"]


async def test_duplicate_lines_are_merged_and_names_are_snapshotted(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client, name="Risoto", price="50.00")
    order = (await place_order(client, [(product["id"], 1), (product["id"], 2)])).json()
    assert len(order["items"]) == 1 and order["items"][0]["quantity"] == 3

    await admin_client.patch(f"{API}/products/{product['id']}", json={"name": "Risoto Novo", "price": "80.00"})
    again = (await client.get(f"{API}/orders/{order['id']}")).json()
    assert again["items"][0]["product_name"] == "Risoto"  # history is immutable
    assert again["items"][0]["unit_price"] == 50.0


async def test_unavailable_or_archived_products_cannot_be_ordered(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    sold_out = await create_product(admin_client, is_available=False)
    archived = await create_product(admin_client)
    await admin_client.delete(f"{API}/products/{archived['id']}")

    r1 = await place_order(client, [(sold_out["id"], 1)])
    assert r1.status_code == 422 and r1.json()["code"] == "product_unavailable"
    r2 = await place_order(client, [(archived["id"], 1)])
    assert r2.status_code == 422 and r2.json()["code"] == "product_not_found"
    assert await _orders_in_db() == 0


async def test_order_validation(customer):
    client, _ = customer
    empty = await client.post(f"{API}/orders", json={"delivery_address": "Rua A, 1", "items": []})
    assert empty.status_code == 422
    zero_qty = await place_order(client, [(1, 0)])
    assert zero_qty.status_code == 422


async def test_idempotency_key_replays_the_same_order(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    key = str(uuid.uuid4())
    first = await place_order(client, [(product["id"], 2)], key=key)
    second = await place_order(client, [(product["id"], 2)], key=key)
    assert first.status_code == 201
    assert second.status_code == 200 and second.headers["Idempotent-Replayed"] == "true"
    assert first.json()["id"] == second.json()["id"]
    assert await _orders_in_db() == 1


async def test_idempotency_key_with_different_payload_is_rejected(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    key = str(uuid.uuid4())
    await place_order(client, [(product["id"], 1)], key=key)
    response = await place_order(client, [(product["id"], 5)], key=key)
    assert response.status_code == 422 and response.json()["code"] == "idempotency_key_mismatch"


async def test_idempotency_keys_are_scoped_per_user(admin, customer, other_customer):
    admin_client, _ = admin
    product = await create_product(admin_client)
    key = str(uuid.uuid4())
    a = await place_order(customer[0], [(product["id"], 1)], key=key)
    b = await place_order(other_customer[0], [(product["id"], 1)], key=key)
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]


async def test_concurrent_retries_with_the_same_key_create_one_order(admin, customer):
    """Double click / network retry storm: 8 identical requests at the same time."""
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    key = str(uuid.uuid4())
    responses = await asyncio.gather(*[place_order(client, [(product["id"], 1)], key=key) for _ in range(8)])
    statuses = sorted(r.status_code for r in responses)
    assert statuses.count(201) == 1, statuses
    assert set(statuses) <= {200, 201, 409}
    assert len({r.json()["id"] for r in responses if r.status_code in (200, 201)}) == 1
    assert await _orders_in_db() == 1


async def test_customers_cannot_see_each_others_orders(admin, customer, other_customer):
    admin_client, _ = admin
    product = await create_product(admin_client)
    order = (await place_order(customer[0], [(product["id"], 1)])).json()

    snooping = await other_customer[0].get(f"{API}/orders/{order['id']}")
    assert snooping.status_code == 404  # not 403: do not even confirm the id exists
    cancel = await other_customer[0].patch(f"{API}/orders/{order['id']}/status", json={"status": "canceled"})
    assert cancel.status_code == 404
    assert (await other_customer[0].get(f"{API}/orders")).json()["items"] == []
    assert (await admin_client.get(f"{API}/orders/{order['id']}")).status_code == 200


async def test_admin_walks_the_lifecycle_and_timestamps_are_recorded(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    order_id = (await place_order(client, [(product["id"], 1)])).json()["id"]

    for status in ("confirmed", "preparing", "out_for_delivery", "delivered"):
        response = await admin_client.patch(f"{API}/orders/{order_id}/status", json={"status": status})
        assert response.status_code == 200, response.text
        assert response.json()[f"{status}_at"] is not None

    final = (await client.get(f"{API}/orders/{order_id}")).json()
    assert [e["status"] for e in final["tracking_events"]] == [
        "created",
        "confirmed",
        "preparing",
        "out_for_delivery",
        "delivered",
    ]
    assert (await _outbox_types()).count("order.status_changed") == 4

    back = await admin_client.patch(f"{API}/orders/{order_id}/status", json={"status": "canceled"})
    assert back.status_code == 409 and back.json()["code"] == "invalid_transition"


async def test_customer_can_cancel_only_before_preparation(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    early = (await place_order(client, [(product["id"], 1)])).json()["id"]
    late = (await place_order(client, [(product["id"], 1)])).json()["id"]

    assert (await client.patch(f"{API}/orders/{early}/status", json={"status": "canceled"})).status_code == 200

    for status in ("confirmed", "preparing"):
        await admin_client.patch(f"{API}/orders/{late}/status", json={"status": status})
    refused = await client.patch(f"{API}/orders/{late}/status", json={"status": "canceled"})
    assert refused.status_code == 403 and refused.json()["code"] == "transition_not_allowed"

    confirm_own = await client.patch(f"{API}/orders/{early}/status", json={"status": "confirmed"})
    assert confirm_own.status_code == 409  # canceled is terminal


async def test_concurrent_transitions_are_serialised_by_the_row_lock(admin, make_client, customer):
    """Two admins act on the same order at the same instant: exactly one wins."""
    admin_client, admin_user = admin
    second_admin = await make_client()
    await second_admin.post(f"{API}/auth/login", json={"email": admin_user.email, "password": "Senha@Forte123"})
    product = await create_product(admin_client)
    order_id = (await place_order(customer[0], [(product["id"], 1)])).json()["id"]

    confirm, cancel = await asyncio.gather(
        admin_client.patch(f"{API}/orders/{order_id}/status", json={"status": "confirmed"}),
        second_admin.patch(f"{API}/orders/{order_id}/status", json={"status": "canceled"}),
    )
    results = sorted([confirm.status_code, cancel.status_code])
    final = (await admin_client.get(f"{API}/orders/{order_id}")).json()
    if results == [200, 200]:
        # Valid serial history: confirmed first, then canceled (cancel is allowed from confirmed).
        assert [e["status"] for e in final["tracking_events"]] == ["created", "confirmed", "canceled"]
    else:
        assert results == [200, 409]
        assert len(final["tracking_events"]) == 2
    assert final["status"] in {"confirmed", "canceled"}


async def test_order_listing_is_newest_first_with_keyset_cursor(admin, customer):
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client)
    created = [(await place_order(client, [(product["id"], 1)])).json()["id"] for _ in range(5)]

    page1 = (await client.get(f"{API}/orders", params={"limit": 2})).json()
    page2 = (await client.get(f"{API}/orders", params={"limit": 2, "cursor": page1["next_cursor"]})).json()
    page3 = (await client.get(f"{API}/orders", params={"limit": 2, "cursor": page2["next_cursor"]})).json()
    ids = [o["id"] for o in page1["items"] + page2["items"] + page3["items"]]
    assert ids == list(reversed(created)) and page3["next_cursor"] is None
    assert "tracking_events" not in page1["items"][0]  # list payload stays light

    await admin_client.patch(f"{API}/orders/{created[0]}/status", json={"status": "confirmed"})
    confirmed = (await admin_client.get(f"{API}/orders", params={"status": "confirmed"})).json()["items"]
    assert [o["id"] for o in confirmed] == [created[0]]


async def test_failed_order_releases_its_idempotency_key(admin, customer):
    """The key is claimed inside the order transaction: if the order fails, the claim rolls back
    with it and a retry with the same key can succeed later."""
    admin_client, _ = admin
    client, _ = customer
    product = await create_product(admin_client, is_available=False)
    key = str(uuid.uuid4())
    first = await place_order(client, [(product["id"], 1)], key=key)
    assert first.status_code == 422

    await admin_client.patch(f"{API}/products/{product['id']}", json={"is_available": True})
    retry = await place_order(client, [(product["id"], 1)], key=key)
    assert retry.status_code == 201
    assert await _orders_in_db() == 1
