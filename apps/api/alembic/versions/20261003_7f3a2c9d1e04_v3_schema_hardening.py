"""v3 schema hardening

Fixes ORM/schema drift and prepares the tables for scale. See docs/03-modelagem-de-dados.md §9.

* Money FLOAT/REAL -> NUMERIC(12,2); high-volume ids INTEGER -> BIGINT (sequences included).
* Redundant PK indexes dropped; composite indexes matching the real queries created.
* Explicit ON DELETE rules, product soft delete, order_items.product_name, refresh family_id.
* New tables: idempotency_keys and outbox_events.
* Safe on v2 data: REAL goes through double precision, case-duplicate names get suffixed, CHECKs
  stay NOT VALID when old rows violate them (tests/integration/test_migrations.py).
* Rolling deploy: new NOT NULL columns get server-side values (family_id default, a transitional
  product_name trigger to drop in the next "contract" migration).

Revision ID: 7f3a2c9d1e04
Revises: 214646c73669
Create Date: 2026-10-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "7f3a2c9d1e04"
down_revision: str | None = "214646c73669"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, column, referred table, ondelete, old postgres-generated name)
FOREIGN_KEYS = [
    ("product", "category_id", "category", "SET NULL", "product_category_id_fkey"),
    ("orders", "customer_id", "users", "RESTRICT", "orders_customer_id_fkey"),
    ("order_items", "order_id", "orders", "CASCADE", "order_items_order_id_fkey"),
    ("order_items", "product_id", "product", "RESTRICT", "order_items_product_id_fkey"),
    ("order_tracking_events", "order_id", "orders", "CASCADE", "order_tracking_events_order_id_fkey"),
    (
        "order_tracking_events",
        "created_by_user_id",
        "users",
        "SET NULL",
        "order_tracking_events_created_by_user_id_fkey",
    ),
    ("refresh_tokens", "user_id", "users", "CASCADE", "refresh_tokens_user_id_fkey"),
    ("notifications", "user_id", "users", "CASCADE", "notifications_user_id_fkey"),
    ("notifications", "order_id", "orders", "CASCADE", "notifications_order_id_fkey"),
]

BIGINT_COLUMNS = [
    ("orders", "id"),
    ("order_items", "id"),
    ("order_items", "order_id"),
    ("order_tracking_events", "id"),
    ("order_tracking_events", "order_id"),
    ("notifications", "id"),
    ("notifications", "order_id"),
    ("refresh_tokens", "id"),
]
BIGINT_SEQUENCES = [
    "orders_id_seq",
    "order_items_id_seq",
    "order_tracking_events_id_seq",
    "notifications_id_seq",
    "refresh_tokens_id_seq",
]

MONEY_COLUMNS = [
    ("product", "price"),
    ("orders", "total_amount"),
    ("order_items", "unit_price"),
    ("order_items", "total_price"),
]

OLD_INDEXES = [
    ("category", "ix_category_id", ["id"], False),
    ("category", "ix_category_name", ["name"], True),
    ("users", "ix_users_id", ["id"], False),
    ("users", "ix_users_email", ["email"], True),
    ("users", "ix_users_phone", ["phone"], True),
    ("product", "ix_product_id", ["id"], False),
    ("orders", "ix_orders_id", ["id"], False),
    ("orders", "ix_orders_customer_id", ["customer_id"], False),
    ("orders", "ix_orders_status", ["status"], False),
    ("order_items", "ix_order_items_id", ["id"], False),
    ("order_tracking_events", "ix_order_tracking_events_id", ["id"], False),
    ("order_tracking_events", "ix_order_tracking_events_created_at", ["created_at"], False),
    ("order_tracking_events", "ix_order_tracking_events_status", ["status"], False),
    ("order_tracking_events", "ix_order_tracking_events_order_id", ["order_id"], False),
    ("refresh_tokens", "ix_refresh_tokens_id", ["id"], False),
    ("refresh_tokens", "ix_refresh_tokens_created_at", ["created_at"], False),
    ("refresh_tokens", "ix_refresh_tokens_expires_at", ["expires_at"], False),
    ("refresh_tokens", "ix_refresh_tokens_jti_hash", ["jti_hash"], True),
    ("refresh_tokens", "ix_refresh_tokens_replaced_by_jti_hash", ["replaced_by_jti_hash"], False),
    ("refresh_tokens", "ix_refresh_tokens_revoked_at", ["revoked_at"], False),
    ("refresh_tokens", "ix_refresh_tokens_user_id", ["user_id"], False),
    ("notifications", "ix_notifications_id", ["id"], False),
    ("notifications", "ix_notifications_created_at", ["created_at"], False),
    ("notifications", "ix_notifications_event_type", ["event_type"], False),
    ("notifications", "ix_notifications_order_id", ["order_id"], False),
    ("notifications", "ix_notifications_user_id", ["user_id"], False),
]

UNIQUE_CONSTRAINTS = [
    ("category", "uq_category_name", ["name"]),
    ("users", "uq_users_email", ["email"]),
    ("users", "uq_users_phone", ["phone"]),
    ("refresh_tokens", "uq_refresh_tokens_jti_hash", ["jti_hash"]),
]

CREATED_AT_DEFAULTS = [
    ("users", "created_at"),
    ("users", "updated_at"),
    ("orders", "created_at"),
    ("orders", "updated_at"),
    ("order_tracking_events", "created_at"),
    ("refresh_tokens", "created_at"),
    ("notifications", "created_at"),
]


CHECKS = [
    ("ck_product_price_positive", "product", "price > 0"),
    ("ck_orders_total_non_negative", "orders", "total_amount >= 0"),
    ("ck_order_items_quantity_positive", "order_items", "quantity > 0"),
    ("ck_order_items_unit_price_non_negative", "order_items", "unit_price >= 0"),
]


def _add_check(name: str, table: str, expression: str) -> None:
    """NOT VALID first (cheap, enforced for new rows), VALIDATE only if old rows comply.

    Legacy rows that break a new rule (a v2 product priced 0, for instance) are a business decision,
    not something a migration should silently "fix".
    """
    op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({expression}) NOT VALID")
    violations = op.get_bind().execute(sa.text(f"SELECT count(*) FROM {table} WHERE NOT ({expression})")).scalar()
    if violations:
        print(f"WARNING: {name} left NOT VALID: {violations} existing row(s) in {table} violate '{expression}'.")
    else:
        op.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")


def _fk_name(table: str, column: str, referred: str) -> str:
    return f"fk_{table}_{column}_{referred}"


def _drop_foreign_key(table: str, column: str) -> None:
    """Drop the FK on (table, column) whatever its name is.

    Databases created by the original migrations without a naming convention have
    Postgres-generated names (``product_category_id_fkey``); fresh ones follow the convention.
    """
    name = (
        op.get_bind()
        .execute(
            sa.text(
                """
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
            WHERE con.contype = 'f' AND rel.relname = :table AND att.attname = :column
            """
            ),
            {"table": table, "column": column},
        )
        .scalar()
    )
    if name:
        op.drop_constraint(name, table, type_="foreignkey")


def upgrade() -> None:
    # 1. Foreign keys go first: column types cannot change while constraints depend on them.
    for table, column, _referred, _ondelete, _old_name in FOREIGN_KEYS:
        _drop_foreign_key(table, column)

    # 2. Redundant / soon-to-be-replaced indexes.
    for table, name, _cols, _unique in OLD_INDEXES:
        op.drop_index(name, table_name=table)

    # 3. Types.
    for table, column in BIGINT_COLUMNS:
        op.alter_column(table, column, type_=sa.BigInteger(), existing_nullable=False)
    for sequence in BIGINT_SEQUENCES:
        op.execute(f"ALTER SEQUENCE {sequence} AS bigint")
    for table, column in MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.Numeric(12, 2),
            # Through double precision first: REAL::numeric keeps only 6 significant digits.
            postgresql_using=f"round({column}::double precision::numeric, 2)",
            existing_nullable=False,
        )

    # 4. New / tightened columns.
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("category", sa.Column("position", sa.Integer(), nullable=False, server_default="0"))

    op.execute("UPDATE product SET highlights = false WHERE highlights IS NULL")
    op.alter_column(
        "product", "highlights", nullable=False, server_default=sa.text("false"), existing_type=sa.Boolean()
    )
    op.alter_column(
        "product", "is_offer", server_default=sa.text("false"), existing_type=sa.Boolean(), existing_nullable=False
    )
    op.alter_column("product", "description", server_default="", existing_type=sa.String(1000), existing_nullable=False)
    op.alter_column(
        "product", "short_description", server_default="", existing_type=sa.String(255), existing_nullable=False
    )
    op.add_column("product", sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("product", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "product", sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    )
    op.add_column(
        "product", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    )

    op.add_column("order_items", sa.Column("product_name", sa.String(100), nullable=True))
    op.execute("UPDATE order_items oi SET product_name = p.name FROM product p WHERE p.id = oi.product_id")
    op.execute("UPDATE order_items SET product_name = 'Produto removido' WHERE product_name IS NULL")
    op.alter_column("order_items", "product_name", nullable=False, existing_type=sa.String(100))

    # Transitional (expand/contract): v2 pods still running during the rollout insert items
    # without product_name; fill it from the product so their INSERTs do not fail.
    op.execute(
        """
        CREATE FUNCTION order_items_fill_product_name() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.product_name IS NULL THEN
                SELECT left(name, 100) INTO NEW.product_name FROM product WHERE id = NEW.product_id;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_order_items_fill_product_name BEFORE INSERT ON order_items "
        "FOR EACH ROW EXECUTE FUNCTION order_items_fill_product_name()"
    )

    op.add_column(
        "refresh_tokens",
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),  # also covers v2 INSERTs during the rollout
        ),
    )

    op.alter_column("notifications", "order_id", nullable=True, existing_type=sa.BigInteger())
    op.alter_column(
        "notifications", "is_read", server_default=sa.text("false"), existing_type=sa.Boolean(), existing_nullable=False
    )
    op.add_column("notifications", sa.Column("source_event_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_unique_constraint("uq_notifications_source_event_id", "notifications", ["source_event_id"])

    op.alter_column(
        "users", "is_active", server_default=sa.text("true"), existing_type=sa.Boolean(), existing_nullable=False
    )
    for table, column in CREATED_AT_DEFAULTS:
        op.alter_column(
            table,
            column,
            server_default=sa.func.now(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=False,
        )

    # 5. Constraints and indexes that encode the business rules and the real access paths.
    for table, name, cols in UNIQUE_CONSTRAINTS:
        op.create_unique_constraint(name, table, cols)
    for name, table, expression in CHECKS:
        _add_check(name, table, expression)

    # v2 allowed "Calabresa" and "calabresa": keep the oldest name, suffix the others with their id.
    op.execute(
        """
        UPDATE product p SET name = left(p.name, 88) || ' (#' || p.id || ')'
        WHERE EXISTS (SELECT 1 FROM product q WHERE lower(q.name) = lower(p.name) AND q.id < p.id)
        """
    )
    op.execute("CREATE UNIQUE INDEX uq_product_name_active ON product (lower(name)) WHERE archived_at IS NULL")
    op.create_index(
        "ix_product_category_active", "product", ["category_id"], postgresql_where=sa.text("archived_at IS NULL")
    )
    op.create_index("ix_orders_customer_created", "orders", ["customer_id", "created_at", "id"])
    op.create_index("ix_orders_status_created", "orders", ["status", "created_at", "id"])
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"])
    op.create_index("ix_order_tracking_events_order_id", "order_tracking_events", ["order_id", "id"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index(
        "ix_refresh_tokens_user_active", "refresh_tokens", ["user_id"], postgresql_where=sa.text("revoked_at IS NULL")
    )
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at", "id"])
    op.create_index(
        "ix_notifications_user_unread", "notifications", ["user_id"], postgresql_where=sa.text("is_read = false")
    )

    for table, column, referred, ondelete, _old in FOREIGN_KEYS:
        op.create_foreign_key(_fk_name(table, column, referred), table, referred, [column], ["id"], ondelete=ondelete)

    # 6. New tables.
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_idempotency_keys_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["orders.id"], name="fk_idempotency_keys_order_id_orders", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_idempotency_keys"),
        sa.UniqueConstraint("user_id", "key", name="uq_idempotency_keys_user_key"),
    )
    op.create_index("ix_idempotency_keys_created_at", "idempotency_keys", ["created_at"])

    op.create_table(
        "outbox_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("aggregate_type", sa.String(40), nullable=False),
        sa.Column("aggregate_id", sa.BigInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_error", sa.String(500), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_outbox_events"),
        sa.UniqueConstraint("event_id", name="uq_outbox_events_event_id"),
    )
    op.create_index(
        "ix_outbox_events_unpublished", "outbox_events", ["id"], postgresql_where=sa.text("published_at IS NULL")
    )


def downgrade() -> None:
    op.drop_index("ix_outbox_events_unpublished", table_name="outbox_events")
    op.drop_table("outbox_events")
    op.drop_index("ix_idempotency_keys_created_at", table_name="idempotency_keys")
    op.drop_table("idempotency_keys")

    for table, column, referred, _ondelete, _old in FOREIGN_KEYS:
        op.drop_constraint(_fk_name(table, column, referred), table, type_="foreignkey")

    for name, table in [
        ("ix_notifications_user_unread", "notifications"),
        ("ix_notifications_user_created", "notifications"),
        ("ix_refresh_tokens_user_active", "refresh_tokens"),
        ("ix_refresh_tokens_family_id", "refresh_tokens"),
        ("ix_order_tracking_events_order_id", "order_tracking_events"),
        ("ix_order_items_product_id", "order_items"),
        ("ix_orders_status_created", "orders"),
        ("ix_orders_customer_created", "orders"),
        ("ix_product_category_active", "product"),
        ("uq_product_name_active", "product"),
    ]:
        op.drop_index(name, table_name=table)

    for name, table, _expression in CHECKS:
        op.drop_constraint(op.f(name), table, type_="check")
    for table, name, _cols in UNIQUE_CONSTRAINTS:
        op.drop_constraint(name, table, type_="unique")

    op.drop_constraint("uq_notifications_source_event_id", "notifications", type_="unique")
    op.drop_column("notifications", "source_event_id")
    op.execute("DELETE FROM notifications WHERE order_id IS NULL")
    op.alter_column("notifications", "order_id", nullable=False, existing_type=sa.BigInteger())
    op.drop_column("refresh_tokens", "family_id")
    op.execute("DROP TRIGGER IF EXISTS trg_order_items_fill_product_name ON order_items")
    op.execute("DROP FUNCTION IF EXISTS order_items_fill_product_name()")
    op.drop_column("order_items", "product_name")
    for column in ("updated_at", "created_at", "archived_at", "is_available"):
        op.drop_column("product", column)
    op.alter_column("product", "highlights", nullable=True, server_default=None, existing_type=sa.Boolean())
    op.drop_column("category", "position")
    op.drop_column("users", "last_login_at")

    for table, column in MONEY_COLUMNS:
        target = sa.REAL() if table == "product" else sa.Float()
        op.alter_column(
            table, column, type_=target, postgresql_using=f"{column}::double precision", existing_nullable=False
        )
    for sequence in BIGINT_SEQUENCES:
        op.execute(f"ALTER SEQUENCE {sequence} AS integer")
    for table, column in BIGINT_COLUMNS:
        op.alter_column(table, column, type_=sa.Integer())

    for table, name, cols, unique in OLD_INDEXES:
        op.create_index(name, table, cols, unique=unique)
    for table, column, referred, _ondelete, old_name in FOREIGN_KEYS:
        op.create_foreign_key(old_name, table, referred, [column], ["id"])
