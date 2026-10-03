"""The v3 migration against a database shaped like real v2 production data.

Builds v2 with the original migrations, inserts the messy data v2 allowed, upgrades, and checks that
nothing was lost or silently changed and that v2 pods can keep writing during a rolling deploy.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import asyncpg
import pytest

from alembic import command
from tests.conftest import TEST_DATABASE_URL, alembic_config, recreate_database

pytestmark = pytest.mark.integration

V2_HEAD = "214646c73669"
MIGRATION_DB_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/lux_delivery_migration_test"
DSN = MIGRATION_DB_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
LONG_URL = "https://cdn.example.com/" + "x" * 600


async def _alembic(*args: str) -> None:
    config = alembic_config(MIGRATION_DB_URL)
    action = args[0]
    try:
        if action == "upgrade":
            await asyncio.to_thread(command.upgrade, config, args[1])
        else:
            await asyncio.to_thread(command.downgrade, config, args[1])
    finally:
        alembic_config(TEST_DATABASE_URL)  # leave the env pointing at the main test DB


async def _seed_v2(conn: asyncpg.Connection) -> None:
    now = datetime.now(UTC)
    await conn.execute(
        """INSERT INTO users (id, full_name, email, phone, hashed_password, role, is_active, created_at, updated_at)
           VALUES (1, 'Cliente v2', 'v2@lux.dev', NULL, 'x', 'CUSTOMER', true, $1, $1)""",
        now,
    )
    await conn.execute("INSERT INTO category (id, name) VALUES (1, 'Pizzas')")
    rows = [
        (1, "Calabresa", 12345.67, None),  # REAL column: the classic precision trap
        (2, "calabresa", 30.0, None),  # case-insensitive duplicate (allowed in v2)
        (3, "Agua da casa", 0.0, LONG_URL),  # price 0 + a URL longer than the new API limit
    ]
    for pid, name, price, image in rows:
        await conn.execute(
            """INSERT INTO product (id, name, price, description, short_description, is_offer, category_id,
                                    image_url, highlights)
               VALUES ($1, $2, $3, 'desc', 'curta', false, 1, $4, NULL)""",
            pid,
            name,
            price,
            image,
        )
    await conn.execute(
        """INSERT INTO orders (id, customer_id, status, total_amount, delivery_address, created_at, updated_at)
           VALUES (1, 1, 'DELIVERED', 12375.67, 'Rua A, 1', $1, $1)""",
        now,
    )
    await conn.execute(
        """INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
           VALUES (1, 1, 1, 12345.67, 12345.67), (1, 2, 1, 30.0, 30.0)"""
    )
    await conn.execute(
        """INSERT INTO refresh_tokens (user_id, jti_hash, expires_at, created_at)
           VALUES (1, 'h1', $1, $2)""",
        now + timedelta(days=7),
        now,
    )
    # Keep sequences ahead of the explicit ids.
    for table in ("users", "category", "product", "orders"):
        await conn.execute(f"SELECT setval('{table}_id_seq', (SELECT max(id) FROM {table}))")


async def test_v3_migration_on_v2_shaped_data():
    await recreate_database(MIGRATION_DB_URL)
    await _alembic("upgrade", V2_HEAD)
    conn = await asyncpg.connect(DSN)
    try:
        await _seed_v2(conn)
    finally:
        await conn.close()

    await _alembic("upgrade", "head")

    conn = await asyncpg.connect(DSN)
    try:
        products = {r["id"]: r for r in await conn.fetch("SELECT id, name, price, image_url FROM product")}
        # REAL -> NUMERIC without losing cents (REAL::numeric alone gives 12345.70).
        assert products[1]["price"] == Decimal("12345.67")
        assert await conn.fetchval("SELECT unit_price FROM order_items WHERE product_id = 1") == Decimal("12345.67")
        # Case-insensitive duplicate renamed instead of aborting the unique index.
        assert products[1]["name"] == "Calabresa"
        assert products[2]["name"] == "calabresa (#2)"
        # Data that breaks the new rules is kept, not "fixed" behind the business's back.
        assert products[3]["price"] == Decimal("0.00")
        assert len(products[3]["image_url"]) == len(LONG_URL)
        validated = await conn.fetchval(
            "SELECT convalidated FROM pg_constraint WHERE conname = 'ck_product_price_positive'"
        )
        assert validated is False  # enforced for new rows, flagged for review
        assert await conn.fetchval(
            "SELECT convalidated FROM pg_constraint WHERE conname = 'ck_order_items_quantity_positive'"
        )
        # Backfill: the snapshot is the name at purchase time, taken before the live product was
        # renamed, so the historical order still says "calabresa".
        names = await conn.fetch("SELECT product_name FROM order_items ORDER BY id")
        assert [r["product_name"] for r in names] == ["Calabresa", "calabresa"]
        assert await conn.fetchval("SELECT count(*) FROM refresh_tokens WHERE family_id IS NULL") == 0

        # A v2 pod still running during the rolling deploy keeps working:
        await conn.execute(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) "
            "VALUES (1, 1, 2, 12345.67, 24691.34)"
        )
        assert await conn.fetchval("SELECT product_name FROM order_items ORDER BY id DESC LIMIT 1") == "Calabresa"
        await conn.execute(
            "INSERT INTO refresh_tokens (user_id, jti_hash, expires_at, created_at) VALUES (1, 'h2', now(), now())"
        )
        assert await conn.fetchval("SELECT family_id IS NOT NULL FROM refresh_tokens WHERE jti_hash = 'h2'")

        # The NOT VALID check still rejects new bad rows.
        with pytest.raises(asyncpg.CheckViolationError):
            await conn.execute(
                "INSERT INTO product (name, price, description, short_description) VALUES ('Brinde', 0, '', '')"
            )
    finally:
        await conn.close()

    # And it is reversible with this data.
    await _alembic("downgrade", V2_HEAD)
    await _alembic("upgrade", "head")
