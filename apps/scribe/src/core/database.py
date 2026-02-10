"""
Database Module

SQLAlchemy configuration for PostgreSQL with pgvector support.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


def get_sync_engine():
    """Create synchronous SQLAlchemy engine for Celery workers."""
    settings = get_settings()
    return create_engine(
        settings.database.url,
        pool_size=settings.database.pool_size,
        max_overflow=settings.database.max_overflow,
        pool_pre_ping=True,  # Verify connections before use
        pool_recycle=3600,  # Recycle connections after 1 hour
        echo=settings.debug,
    )


def get_async_engine():
    """Create async SQLAlchemy engine for FastAPI."""
    settings = get_settings()
    return create_async_engine(
        settings.database.async_url,
        pool_size=settings.database.pool_size,
        max_overflow=settings.database.max_overflow,
        pool_pre_ping=True,
        pool_recycle=3600,
        echo=settings.debug,
    )


# Sync session factory for Celery workers
_sync_engine = None
_sync_session_factory = None


def get_sync_session_factory() -> sessionmaker[Session]:
    """Get or create sync session factory."""
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
    """
    Get a synchronous database session for Celery workers.

    Usage:
        with get_db_session() as session:
            # do work
            session.commit()
    """
    factory = get_sync_session_factory()
    session = factory()
    try:
        return session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# Async session factory for FastAPI
_async_engine = None
_async_session_factory = None


def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Get or create async session factory."""
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
    """
    Get an async database session for FastAPI.

    Usage:
        async with get_async_db_session() as session:
            # do work
            await session.commit()
    """
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
    """Check if database connection is working."""
    try:
        async with get_async_db_session() as session:
            await session.execute(text("SELECT 1"))
            return True
    except Exception as e:
        logger.error("Database connection check failed", error=str(e))
        return False
