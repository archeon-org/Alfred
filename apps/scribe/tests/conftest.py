"""Shared test fixtures for the Scribe test suite."""

from __future__ import annotations

import uuid
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

import db.models  # noqa: F401 — register all models with Base.metadata
from db.base import Base

TEST_DB_URL = "sqlite://"


def _register_sqlite_type_overrides():
    """SQLite doesn't support PostgreSQL-specific types.
    Register compilation overrides so the test suite can run."""
    from pgvector.sqlalchemy import Vector
    from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
    from sqlalchemy.ext.compiler import compiles

    @compiles(Vector, "sqlite")
    def _vector(type_, compiler, **kw):
        return "TEXT"

    @compiles(TSVECTOR, "sqlite")
    def _tsvector(type_, compiler, **kw):
        return "TEXT"

    @compiles(JSONB, "sqlite")
    def _jsonb(type_, compiler, **kw):
        return "TEXT"

    @compiles(PG_UUID, "sqlite")
    def _uuid(type_, compiler, **kw):
        return "VARCHAR(36)"


_register_sqlite_type_overrides()


def _enable_sqlite_fk(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _create_tables_for_sqlite(engine):
    """Create all tables, temporarily stripping PostgreSQL-specific server_defaults
    that SQLite cannot parse (gen_random_uuid(), ::jsonb casts, etc.).
    The defaults are restored immediately after so the model metadata stays intact."""
    saved_defaults = {}
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            if col.server_default is not None:
                saved_defaults[(table.name, col.name)] = col.server_default
                col.server_default = None

    try:
        Base.metadata.create_all(engine)
    finally:
        for (tbl, col_name), default in saved_defaults.items():
            Base.metadata.tables[tbl].c[col_name].server_default = default


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DB_URL, echo=False)
    event.listen(eng, "connect", _enable_sqlite_fk)
    _create_tables_for_sqlite(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def session(engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    sess = sessionmaker(bind=connection)()

    yield sess

    sess.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def sample_user_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture()
def sample_document_id() -> str:
    return str(uuid.uuid4())
