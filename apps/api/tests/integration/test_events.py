"""End-to-end of the event pipeline: outbox -> relay -> Redis Stream -> consumer groups -> SSE."""

import asyncio
import contextlib
import json
import socket

import httpx
import pytest
import uvicorn
from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.outbox import OutboxEvent
from app.core.realtime import hub, publish, user_channel
from app.core.redis import get_redis
from app.core.security import ACCESS_COOKIE
from app.main import app
from app.modules.notifications import consumer as notifications_consumer
from app.modules.notifications.models import Notification
from app.modules.realtime import consumer as realtime_consumer
from app.workers import consumer, outbox_relay
from tests.conftest import API, create_product, place_order

pytestmark = pytest.mark.integration


async def _relay_all() -> int:
    async with SessionLocal() as session:
        return await outbox_relay.relay_once(session)


async def _consume(group: str, handler) -> int:
    redis = get_redis()
    await consumer.ensure_group(redis, group)
    return await consumer.consume_once(redis, group, handler, block_ms=None)


async def _notifications_for(user_id: int) -> list[Notification]:
    async with SessionLocal() as session:
        query = select(Notification).where(Notification.user_id == user_id).order_by(Notification.id)
        return list((await session.execute(query)).scalars())


async def test_relay_publishes_outbox_rows_once(admin, customer):
    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)])

    assert await _relay_all() == 1
    assert await _relay_all() == 0  # already marked as published
    entries = await get_redis().xrange(settings.EVENTS_STREAM)
    assert len(entries) == 1
    fields = entries[0][1]
    assert fields["event_type"] == "order.created"
    assert json.loads(fields["payload"])["customer_id"] == customer[1].id
    async with SessionLocal() as session:
        pending = await outbox_relay.pending_count(session)
    assert pending == 0


async def test_outbox_row_is_written_in_the_same_transaction_as_the_order(admin, customer):
    """If the order insert fails, no event must exist (no phantom 'order.created')."""
    admin_client, _ = admin
    sold_out = await create_product(admin_client, is_available=False)
    response = await place_order(customer[0], [(sold_out["id"], 1)])
    assert response.status_code == 422
    async with SessionLocal() as session:
        assert (await session.execute(select(func.count()).select_from(OutboxEvent))).scalar_one() == 0


async def test_notifications_consumer_is_idempotent_under_redelivery(admin, customer):
    admin_client, _ = admin
    client, user = customer
    product = await create_product(admin_client)
    order_id = (await place_order(client, [(product["id"], 1)])).json()["id"]
    await admin_client.patch(f"{API}/orders/{order_id}/status", json={"status": "confirmed"})
    await _relay_all()

    assert await _consume("notifications", notifications_consumer.handle) == 2
    created = await _notifications_for(user.id)
    assert [n.event_type for n in created] == ["order_created", "order_confirmed"]

    # At-least-once delivery: replay the very same events through the handler.
    for _id, fields in await get_redis().xrange(settings.EVENTS_STREAM):
        await notifications_consumer.handle(fields["event_id"], fields["event_type"], json.loads(fields["payload"]))
    assert len(await _notifications_for(user.id)) == 2

    listed = (await client.get(f"{API}/notifications")).json()["items"]
    assert len(listed) == 2
    assert (await client.get(f"{API}/notifications/unread-count")).json() == {"unread": 2}
    assert (await client.post(f"{API}/notifications/read-all")).json() == {"updated": 2}
    assert (await client.get(f"{API}/notifications/unread-count")).json() == {"unread": 0}


async def test_consumer_groups_have_independent_offsets(admin, customer):
    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)])
    await _relay_all()

    seen: list[str] = []

    async def spy(event_id, event_type, payload):
        seen.append(event_type)

    assert await _consume("notifications", notifications_consumer.handle) == 1
    assert await _consume("analytics-spy", spy) == 1  # a new group still sees the event
    assert seen == ["order.created"]


async def test_poison_message_goes_to_dead_letter_after_max_deliveries(admin, customer, monkeypatch):
    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)])
    await _relay_all()
    monkeypatch.setattr(settings, "CONSUMER_MAX_DELIVERIES", 2)
    monkeypatch.setattr(consumer, "_CLAIM_IDLE_MS", 0)  # reclaim immediately for the test

    async def broken(event_id, event_type, payload):
        raise RuntimeError("bug in handler")

    redis = get_redis()
    await consumer.ensure_group(redis, "fragile")
    await consumer.consume_once(redis, "fragile", broken, block_ms=None)  # delivery 1: stays pending
    await consumer.consume_once(redis, "fragile", broken, block_ms=None)  # delivery 2: dead-lettered
    dlq = await redis.xrange(consumer.dead_letter_stream())
    assert len(dlq) == 1 and dlq[0][1]["group"] == "fragile"
    pending = await redis.xpending(settings.EVENTS_STREAM, "fragile")
    assert pending["pending"] == 0


async def test_realtime_consumer_fans_out_to_user_and_admin_channels(admin, customer):
    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)])
    await _relay_all()

    pubsub = get_redis().pubsub()
    await pubsub.subscribe(user_channel(customer[1].id), "lux:rt:role:admin")
    await pubsub.get_message(timeout=1)
    await pubsub.get_message(timeout=1)
    await _consume("realtime", realtime_consumer.handle)
    received = []
    for _ in range(2):
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=2)
        if message:
            received.append((message["channel"], json.loads(message["data"])["type"]))
    await pubsub.aclose()
    assert (user_channel(customer[1].id), "order.updated") in received
    assert ("lux:rt:role:admin", "order.created") in received


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.asynccontextmanager
async def _live_server():
    """A real HTTP server on the test event loop: ASGITransport buffers whole responses and
    cannot test a stream."""
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, lifespan="off", log_level="warning"))
    server.install_signal_handlers = lambda: None
    task = asyncio.create_task(server.serve())
    while not server.started:  # noqa: ASYNC110 - uvicorn exposes no startup event
        await asyncio.sleep(0.02)
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.should_exit = True
        await task


async def test_sse_stream_delivers_events_to_the_right_user(customer):
    client, user = customer
    token = client.cookies.get(ACCESS_COOKIE)
    async with _live_server() as base_url, httpx.AsyncClient(base_url=base_url, timeout=5) as http:
        anonymous = await http.get(f"{API}/events/stream")
        assert anonymous.status_code == 401

        async with http.stream("GET", f"{API}/events/stream", cookies={ACCESS_COOKIE: token}) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            lines = response.aiter_lines()

            async def next_event() -> tuple[str, dict]:
                event = None
                async for line in lines:
                    if line.startswith("event: "):
                        event = line[7:]
                    elif line.startswith("data: ") and event:
                        return event, json.loads(line[6:])
                raise AssertionError("stream ended")

            assert (await asyncio.wait_for(next_event(), 5))[0] == "ready"
            await hub.wait_ready()
            await publish(user_channel(user.id + 999), "order.updated", {"order_id": 1})  # someone else
            await publish(user_channel(user.id), "order.updated", {"order_id": 42, "status": "confirmed"})
            event, data = await asyncio.wait_for(next_event(), 5)
            assert event == "order.updated" and data["order_id"] == 42


async def test_relay_loop_is_woken_by_listen_notify(admin, customer, monkeypatch):
    """With a 30s polling interval, the event must still arrive in well under a second:
    the producer's NOTIFY (delivered on commit) wakes the relay."""
    monkeypatch.setattr(settings, "OUTBOX_POLL_INTERVAL_SECONDS", 30)
    stop = asyncio.Event()
    task = asyncio.create_task(outbox_relay.run(stop))
    try:
        await asyncio.sleep(0.5)  # let LISTEN register
        admin_client, _ = admin
        product = await create_product(admin_client)
        loop = asyncio.get_running_loop()
        started = loop.time()
        await place_order(customer[0], [(product["id"], 1)])
        while not await get_redis().xlen(settings.EVENTS_STREAM):
            assert loop.time() - started < 3, "relay was not woken up by NOTIFY"
            await asyncio.sleep(0.02)
        assert loop.time() - started < 3
    finally:
        stop.set()
        await asyncio.wait_for(task, 5)


async def test_maintenance_purges_expired_rows(admin, customer):
    from datetime import timedelta

    from sqlalchemy import update

    from app.core.database import utcnow
    from app.modules.ordering.models import IdempotencyKey
    from app.workers import maintenance

    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)], key="old-key-123")
    await _relay_all()
    async with SessionLocal() as session:
        await session.execute(update(IdempotencyKey).values(created_at=utcnow() - timedelta(days=2)))
        await session.execute(update(OutboxEvent).values(published_at=utcnow() - timedelta(days=8)))
        await session.commit()

    result = await maintenance.run_once()
    assert result["idempotency_keys"] == 1 and result["outbox_events"] == 1


async def test_infrastructure_failures_never_dead_letter_events(admin, customer, monkeypatch):
    """A Postgres outage must delay notifications, not discard them."""
    admin_client, _ = admin
    product = await create_product(admin_client)
    await place_order(customer[0], [(product["id"], 1)])
    await _relay_all()
    monkeypatch.setattr(settings, "CONSUMER_MAX_DELIVERIES", 2)
    monkeypatch.setattr(consumer, "_CLAIM_IDLE_MS", 0)

    async def database_down(event_id, event_type, payload):
        raise ConnectionRefusedError("connection refused")

    redis = get_redis()
    await consumer.ensure_group(redis, "outage")
    for _ in range(4):  # well beyond CONSUMER_MAX_DELIVERIES
        with pytest.raises(consumer.TransientDependencyError):
            await consumer.consume_once(redis, "outage", database_down, block_ms=None)
    assert await redis.xlen(consumer.dead_letter_stream()) == 0
    assert (await redis.xpending(settings.EVENTS_STREAM, "outage"))["pending"] == 1

    # Once the database is back, the very same event is processed.
    handled = []

    async def database_back(event_id, event_type, payload):
        handled.append(event_type)

    await consumer.consume_once(redis, "outage", database_back, block_ms=None)
    assert handled == ["order.created"]
    assert (await redis.xpending(settings.EVENTS_STREAM, "outage"))["pending"] == 0


async def test_relay_reconnects_listen_after_the_connection_drops(admin, customer, monkeypatch):
    monkeypatch.setattr(settings, "OUTBOX_POLL_INTERVAL_SECONDS", 30)
    monkeypatch.setattr(outbox_relay, "_LISTEN_HEALTHCHECK_SECONDS", 0.2)
    stop = asyncio.Event()
    task = asyncio.create_task(outbox_relay.run(stop))
    try:
        async with SessionLocal() as session:
            for _ in range(50):
                await asyncio.sleep(0.1)
                listening = (
                    (
                        await session.execute(
                            text(
                                "SELECT pid FROM pg_stat_activity "
                                "WHERE query LIKE 'LISTEN%' AND pid <> pg_backend_pid()"
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                await session.rollback()
                if listening:
                    break
            assert listening, "relay never started LISTEN"
            await session.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": listening[0]})
            await session.commit()

        await asyncio.sleep(6)  # the listener notices the drop and reconnects (5 s retry pause at most)
        admin_client, _ = admin
        product = await create_product(admin_client)
        loop = asyncio.get_running_loop()
        started = loop.time()
        await place_order(customer[0], [(product["id"], 1)])
        while not await get_redis().xlen(settings.EVENTS_STREAM):
            assert loop.time() - started < 3, "NOTIFY no longer wakes the relay after reconnect"
            await asyncio.sleep(0.02)
    finally:
        stop.set()
        await asyncio.wait_for(task, 10)
