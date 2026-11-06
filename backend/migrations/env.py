import asyncio
from logging.config import fileConfig

from alembic import context
from alembic.operations import ops
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  registers every model on Base.metadata
from app.core.config import get_settings
from app.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
# Read from settings rather than alembic.ini, so migrations hit the same database as the app.
database_url = get_settings().database_url


def run_migrations_offline() -> None:
    """Emit the migration SQL to stdout (`alembic upgrade head --sql`) without connecting."""
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def enable_rls_on_new_tables(context, revision, directives) -> None:
    """Add `enable row level security` after each table autogenerate creates.

    Supabase grants the anon role full access to new tables in public, so without RLS anyone
    holding the project's public anon key can read and write them through the Data API. RLS
    with no policies blocks that, while the backend, which owns the tables, is unaffected.
    """
    upgrade_ops = directives[0].upgrade_ops
    for op in list(upgrade_ops.ops):
        if isinstance(op, ops.CreateTableOp):
            table = f'"{op.schema}"."{op.table_name}"' if op.schema else f'"{op.table_name}"'
            upgrade_ops.ops.append(
                ops.ExecuteSQLOp(f"alter table {table} enable row level security")
            )


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        process_revision_directives=enable_rls_on_new_tables,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(database_url, poolclass=pool.NullPool)

    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
