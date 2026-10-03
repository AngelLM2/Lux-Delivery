import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

import app.models  # noqa: F401 - populate Base.metadata
from alembic import context
from app.core.config import settings
from app.core.database import Base

config = context.config
if config.config_file_name and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)
# Tests point Alembic at a throwaway database through this variable.
config.set_main_option("sqlalchemy.url", os.environ.get("ALEMBIC_DATABASE_URL", settings.DATABASE_URL))

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # The functional unique index on lower(name) is declared in the model; autogenerate cannot
    # compare expression indexes reliably, so it is excluded from drift detection.
    return not (type_ == "index" and name == "uq_product_name_active")


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=False,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # The database-level statement_timeout (5 s, infra/postgres/init) protects the API; a
        # migration on a big table must not be killed halfway by it.
        connect_args={"server_settings": {"statement_timeout": "0"}},
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
