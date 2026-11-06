from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def create_engine(url: str) -> AsyncEngine:
    # Connection poolers such as Supabase's close idle connections; pre-ping replaces them.
    return create_async_engine(url, pool_pre_ping=True)


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    # Async sessions can't lazy-load expired attributes, so keep them loaded after commit.
    return async_sessionmaker(engine, expire_on_commit=False)
