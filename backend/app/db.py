from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from .config import get_settings


def _async_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgresql://")
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url.removeprefix("postgres://")
    raise ValueError("SUPABASE_DATABASE_URL must be a PostgreSQL connection string")


def create_engine() -> AsyncEngine | None:
    url = get_settings().supabase_database_url
    return (
        create_async_engine(_async_database_url(url), pool_pre_ping=True, pool_size=5)
        if url
        else None
    )


engine = create_engine()
session_factory = (
    async_sessionmaker(engine, expire_on_commit=False) if engine is not None else None
)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    if session_factory is None:
        raise RuntimeError("SUPABASE_DATABASE_URL is not configured")
    async with session_factory() as session:
        yield session


async def check_database() -> bool:
    if engine is None:
        return False
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))
        return True
    except Exception:
        return False
