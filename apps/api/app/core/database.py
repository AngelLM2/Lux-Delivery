from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

# Deterministic constraint names make migrations reviewable and reversible.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
        server_default=func.now(),
    )


def _connect_args() -> dict:
    server_settings = {
        "application_name": "lux-api",
        "statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS),
    }
    args: dict = {"server_settings": server_settings}
    if settings.DB_BEHIND_PGBOUNCER:
        # Transaction pooling hands each transaction a different server connection,
        # so named prepared statements cannot be reused.
        args["statement_cache_size"] = 0
        args["prepared_statement_cache_size"] = 0
        # Unique names avoid "prepared statement already exists" when PgBouncer hands this
        # connection a server session that another client already prepared statements on.
        args["prepared_statement_name_func"] = lambda: f"__lux_{uuid4().hex}__"
        # PgBouncer rejects unknown startup parameters unless ignore_startup_parameters is set.
        args["server_settings"] = {"application_name": "lux-api"}
    return args


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args=_connect_args(),
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)

# Read replica (streaming replication) for reads that tolerate a few seconds of lag. Never use it
# for read-your-writes flows (e.g. "show the order I just created"): the replica may not have it yet.
read_engine = (
    create_async_engine(
        settings.DATABASE_READ_URL,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args=_connect_args(),
    )
    if settings.DATABASE_READ_URL
    else engine
)
ReadSessionLocal = async_sessionmaker(read_engine, expire_on_commit=False, autoflush=False)


async def get_read_session() -> AsyncGenerator[AsyncSession, None]:
    """Session bound to the read replica (or the primary when no replica is configured)."""
    async with ReadSessionLocal() as session:
        yield session


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped session; anything left uncommitted is rolled back when the request ends.

    Services call ``commit()`` explicitly so post-commit side effects (cache, realtime) run in order.
    """
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
