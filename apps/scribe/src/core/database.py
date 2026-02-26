from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


def get_sync_engine():
    settings = get_settings()
    return create_engine(
        settings.database.url,
        pool_size=settings.database.pool_size,
        max_overflow=settings.database.max_overflow,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.debug,
    )


def get_async_engine():
    settings = get_settings()
    return create_async_engine(
        settings.database.async_url,
        pool_size=settings.database.pool_size,
        max_overflow=settings.database.max_overflow,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.debug,
    )


_sync_engine = None
_sync_session_factory = None


def get_sync_session_factory() -> sessionmaker[Session]:
    global _sync_engine, _sync_session_factory
    if _sync_session_factory is None:
        _sync_engine = get_sync_engine()
        _sync_session_factory = sessionmaker(
            bind=_sync_engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _sync_session_factory


def get_db_session() -> Session:
    factory = get_sync_session_factory()
    session = factory()
    try:
        return session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


_async_engine = None
_async_session_factory = None


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_engine, _async_session_factory
    if _async_session_factory is None:
        _async_engine = get_async_engine()
        _async_session_factory = async_sessionmaker(
            bind=_async_engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _async_session_factory


@asynccontextmanager
async def get_async_db_session() -> AsyncGenerator[AsyncSession, None]:
    factory = get_async_session_factory()
    session = factory()
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def check_database_connection() -> bool:
    try:
        async with get_async_db_session() as session:
            await session.execute(text("SELECT 1"))
            return True
    except Exception as e:
        logger.error("Database connection check failed", error=str(e))
        return False
