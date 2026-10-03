"""Test harness on real PostgreSQL and Redis: ``docker compose up -d db redis && pytest``.

Recreates the TEST_DATABASE_URL database and refuses any name not ending in ``_test``.
See docs/adr/0010-testes-com-postgres-e-redis-reais.md.
"""

import asyncio
import os
import tempfile
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

# Settings are read at import time, so the environment must be ready before importing `app`.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://lux:lux@localhost:5433/lux_delivery_test")
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6380/15")
os.environ.update(
    {
        "ENV": "test",
        "DATABASE_URL": TEST_DATABASE_URL,
        "REDIS_URL": TEST_REDIS_URL,
        "BCRYPT_ROUNDS": "4",
        "LOG_JSON": "false",
        "LOG_LEVEL": "WARNING",
        "RATE_LIMIT_MAX_PER_IP": "100000",
        "RATE_LIMIT_MAX_PER_USER": "100000",
        "AUTH_RATE_LIMIT_MAX_ATTEMPTS": "100000",
        "LOGIN_MAX_ATTEMPTS_PER_ACCOUNT": "100000",
        "BOOTSTRAP_ADMIN_TOKEN": "test-bootstrap-token-with-at-least-32-chars",
        "MEDIA_ROOT": str(Path(tempfile.gettempdir()) / "lux-delivery-test-media"),
        "EVENTS_STREAM": "lux:test:events",
    }
)

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.database import SessionLocal, engine  # noqa: E402
from app.core.redis import get_redis  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.identity.models import User, UserRole  # noqa: E402

API = "/api/v1"
PASSWORD = "Senha@Forte123"
API_ROOT = Path(__file__).resolve().parents[1]

TABLES = [
    "notifications",
    "order_tracking_events",
    "order_items",
    "idempotency_keys",
    "outbox_events",
    "orders",
    "refresh_tokens",
    "product",
    "category",
    "users",
]


def alembic_config(database_url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    config.attributes["configure_logger"] = False
    os.environ["ALEMBIC_DATABASE_URL"] = database_url
    return config


async def recreate_database(database_url: str) -> None:
    name = database_url.rsplit("/", 1)[-1]
    if not name.endswith("_test"):
        raise RuntimeError(f"Refusing to recreate non-test database {name!r}")
    admin_dsn = database_url.replace("postgresql+asyncpg://", "postgresql://", 1).rsplit("/", 1)[0] + "/postgres"
    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def database() -> AsyncIterator[None]:
    await recreate_database(TEST_DATABASE_URL)
    # env.py calls asyncio.run(); run it in a worker thread that has no running loop.
    await asyncio.to_thread(command.upgrade, alembic_config(TEST_DATABASE_URL), "head")
    from app.core.health import expected_migration_head

    app.state.migration_head = expected_migration_head()
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_state(database) -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
    await get_redis().flushdb()
    yield


@pytest.fixture
def make_client() -> Callable[[], Awaitable[httpx.AsyncClient]]:
    clients: list[httpx.AsyncClient] = []

    async def factory() -> httpx.AsyncClient:
        client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        clients.append(client)
        return client

    yield factory
    for client in clients:
        asyncio.get_event_loop().create_task(client.aclose())


async def create_user(
    email: str | None = None, role: UserRole = UserRole.CUSTOMER, password: str = PASSWORD, active: bool = True
) -> User:
    async with SessionLocal() as session:
        user = User(
            full_name="Test User",
            email=email or f"user-{uuid.uuid4().hex[:8]}@lux.test",
            hashed_password=await hash_password(password),
            role=role,
            is_active=active,
        )
        session.add(user)
        await session.commit()
        return user


async def login(client: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    response = await client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response


@pytest.fixture
async def admin(make_client) -> tuple[httpx.AsyncClient, User]:
    user = await create_user(role=UserRole.ADMIN)
    client = await make_client()
    await login(client, user.email)
    return client, user


@pytest.fixture
async def customer(make_client) -> tuple[httpx.AsyncClient, User]:
    user = await create_user()
    client = await make_client()
    await login(client, user.email)
    return client, user


@pytest.fixture
async def other_customer(make_client) -> tuple[httpx.AsyncClient, User]:
    user = await create_user()
    client = await make_client()
    await login(client, user.email)
    return client, user


@pytest.fixture
async def anon(make_client) -> httpx.AsyncClient:
    return await make_client()


async def create_category(admin_client: httpx.AsyncClient, name: str | None = None) -> dict:
    response = await admin_client.post(f"{API}/categories", json={"name": name or f"Cat {uuid.uuid4().hex[:6]}"})
    assert response.status_code == 201, response.text
    return response.json()


async def create_product(admin_client: httpx.AsyncClient, **overrides) -> dict:
    payload = {
        "name": f"Produto {uuid.uuid4().hex[:8]}",
        "price": "25.50",
        "description": "Descricao",
        "short_description": "Curta",
    }
    payload.update(overrides)
    response = await admin_client.post(f"{API}/products", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def place_order(
    client: httpx.AsyncClient, items: list[tuple[int, int]], key: str | None = None
) -> httpx.Response:
    headers = {"Idempotency-Key": key} if key else {}
    return await client.post(
        f"{API}/orders",
        json={
            "delivery_address": "Rua Teste, 123 - Sao Paulo",
            "items": [{"product_id": pid, "quantity": qty} for pid, qty in items],
        },
        headers=headers,
    )
