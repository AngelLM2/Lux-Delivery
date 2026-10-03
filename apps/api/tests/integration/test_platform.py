"""Cross-cutting behaviour: health, metrics, rate limiting, error envelope, security headers, schema drift."""

import asyncio

import pytest

from alembic import command
from app.core import middleware, rate_limit
from app.core.config import settings
from app.main import app
from app.modules.identity import dependencies as identity_dependencies
from tests.conftest import API, PASSWORD, TEST_DATABASE_URL, alembic_config, create_user

pytestmark = pytest.mark.integration


async def test_liveness_and_readiness(anon):
    assert (await anon.get("/health/live")).json() == {"status": "ok"}
    ready = await anon.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"] == {"database": "ok", "migrations": "ok", "redis": "ok"}


async def test_metrics_use_route_templates_not_raw_paths(anon):
    await anon.get(f"{API}/products/12345")
    body = (await anon.get("/metrics")).text
    assert 'route="/api/v1/products/{product_id}"' in body
    assert "/products/12345" not in body
    assert "lux_http_request_duration_seconds_bucket" in body


async def test_every_response_has_request_id_and_security_headers(anon):
    response = await anon.get(f"{API}/products", headers={"X-Request-ID": "trace-abc-12345"})
    assert response.headers["x-request-id"] == "trace-abc-12345"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    invalid = await anon.get(f"{API}/products", headers={"X-Request-ID": "bad id with spaces"})
    assert invalid.headers["x-request-id"] != "bad id with spaces"  # header injection guard


async def test_error_envelope_is_consistent(anon):
    body = (await anon.get(f"{API}/products/999999")).json()
    assert set(body) == {"detail", "code", "request_id"}
    assert body["code"] == "product_not_found"


async def test_global_rate_limit_returns_429_with_retry_after(anon, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_MAX_PER_IP", 3)
    statuses = [(await anon.get(f"{API}/categories")).status_code for _ in range(5)]
    assert statuses == [200, 200, 200, 429, 429]
    limited = await anon.get(f"{API}/categories")
    assert int(limited.headers["retry-after"]) >= 1
    assert limited.json()["code"] == "rate_limited"
    assert (await anon.get("/health/live")).status_code == 200  # health is never limited


async def test_global_limiter_fails_open_when_redis_is_down(anon, monkeypatch):
    async def redis_down(*args, **kwargs):
        raise rate_limit.RateLimiterUnavailable("connection refused")

    monkeypatch.setattr(middleware, "hit", redis_down)
    assert (await anon.get(f"{API}/categories")).status_code == 200


async def test_auth_limiter_fails_closed_when_redis_is_down(anon, monkeypatch):
    async def redis_down(*args, **kwargs):
        raise rate_limit.RateLimiterUnavailable("connection refused")

    monkeypatch.setattr(identity_dependencies, "hit", redis_down)
    response = await anon.post(f"{API}/auth/login", json={"email": "a@lux.dev", "password": "x"})
    assert response.status_code == 503


async def test_login_is_limited_per_account_across_ips(make_client, monkeypatch):
    """Credential stuffing from many IPs still hits the per-account limit."""
    monkeypatch.setattr(settings, "LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 3)
    user = await create_user()
    clients = [await make_client() for _ in range(4)]
    statuses = []
    for client in clients:
        response = await client.post(f"{API}/auth/login", json={"email": user.email, "password": "Errada@12345"})
        statuses.append(response.status_code)
    assert statuses == [401, 401, 401, 429]
    blocked = await clients[0].post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
    assert blocked.status_code == 429  # even the right password waits for the window


async def test_models_and_migrations_have_no_drift():
    """`alembic check` fails if the ORM models differ from what the migrations build."""
    await asyncio.to_thread(command.check, alembic_config(TEST_DATABASE_URL))


async def test_constraint_names_follow_the_naming_convention():
    """`alembic check` ignores CHECK constraints; this catches names mangled by the convention."""
    from sqlalchemy import text

    from app.core.database import engine

    async with engine.connect() as conn:
        rows = await conn.execute(
            text(
                "SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace "
                "WHERE n.nspname = 'public' AND contype IN ('c', 'f', 'u')"
            )
        )
        names = {row[0] for row in rows}
    assert {
        "ck_product_price_positive",
        "ck_orders_total_non_negative",
        "ck_order_items_quantity_positive",
        "fk_orders_customer_id_users",
        "uq_users_email",
        "uq_idempotency_keys_user_key",
    } <= names
    assert not [n for n in names if n.startswith(("ck_ck_", "ck_orders_ck_", "ck_product_ck_", "ck_order_items_ck_"))]


async def test_keyset_pagination_is_an_index_condition():
    """Regression test on the *query plan*: the cursor must be an index condition, not a filter.

    The OR-expanded form looks equivalent but is only a filter (docs/03-modelagem-de-dados.md §5)."""
    from datetime import UTC, datetime

    from sqlalchemy import text
    from sqlalchemy.dialects import postgresql

    from app.core.database import SessionLocal
    from app.modules.ordering.repository import OrderRepository

    captured = {}
    async with SessionLocal() as session:
        repo = OrderRepository(session)
        original_execute = session.execute

        async def capture(statement, *args, **kwargs):
            captured.setdefault("sql", statement)
            return await original_execute(statement, *args, **kwargs)

        session.execute = capture
        await repo.list_page(limit=21, customer_id=1, status=None, after=(datetime.now(UTC), 10))
        session.execute = original_execute

        sql = str(captured["sql"].compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        await session.execute(text("SET LOCAL enable_seqscan = off"))
        plan = "\n".join(row[0] for row in (await session.execute(text(f"EXPLAIN {sql}"))).all())
        await session.rollback()

    assert "ix_orders_customer_created" in plan
    index_cond = next(line for line in plan.splitlines() if "Index Cond" in line)
    assert "ROW(created_at, id) <" in index_cond, plan


async def test_unhandled_errors_are_500_with_request_id(anon):
    async def boom():
        raise RuntimeError("bug")

    app.add_api_route("/__boom", boom)
    try:
        response = await anon.get("/__boom", headers={"X-Request-ID": "trace-boom-123"})
    finally:
        app.router.routes.pop()
    assert response.status_code == 500
    assert response.json() == {
        "detail": "Erro interno. Tente novamente.",
        "code": "internal_error",
        "request_id": "trace-boom-123",
    }
    assert response.headers["x-request-id"] == "trace-boom-123"


async def test_load_shedding_rejects_beyond_the_in_flight_limit(anon, monkeypatch):
    import asyncio as _asyncio

    from app.core.middleware import LoadShedMiddleware

    gate = _asyncio.Event()

    async def slow():
        await gate.wait()
        return {"ok": True}

    app.add_api_route("/__slow", slow)
    shed = next(m for m in app.user_middleware if m.cls is LoadShedMiddleware)
    instance = app.middleware_stack
    while instance is not None and not isinstance(instance, LoadShedMiddleware):
        instance = getattr(instance, "app", None)
    assert instance is not None and shed is not None
    monkeypatch.setattr(instance, "limit", 2)
    try:
        first = [_asyncio.create_task(anon.get("/__slow")) for _ in range(2)]
        await _asyncio.sleep(0.1)
        rejected = await anon.get("/__slow")
        assert rejected.status_code == 503 and rejected.headers["retry-after"] == "1"
        assert (await anon.get("/health/live")).status_code == 200  # never shed
        gate.set()
        assert [r.status_code for r in await _asyncio.gather(*first)] == [200, 200]
    finally:
        app.router.routes.pop()


async def test_successful_logins_do_not_consume_the_account_limit(anon, monkeypatch):
    """Only failures count: a user who logs in often must never lock themselves out."""
    monkeypatch.setattr(settings, "LOGIN_MAX_ATTEMPTS_PER_ACCOUNT", 3)
    user = await create_user()
    for _ in range(5):
        response = await anon.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
        assert response.status_code == 200
