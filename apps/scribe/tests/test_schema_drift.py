"""Schema drift detection tests.

These tests verify that the SQLAlchemy model definitions stay in sync
with the live PostgreSQL database managed by TypeORM migrations.

Run with:
    pytest tests/test_schema_drift.py -v

Requires DATABASE_* environment variables pointing to the shared database.
Skipped automatically if the database is not reachable.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

import db.models  # noqa: F401
from db.base import Base


def _get_database_url() -> str | None:
    host = os.environ.get("DATABASE_HOST")
    if not host:
        return None
    port = os.environ.get("DATABASE_PORT", "5432")
    name = os.environ.get("DATABASE_NAME", "postgres")
    user = os.environ.get("DATABASE_USERNAME", "postgres")
    password = os.environ.get("DATABASE_PASSWORD", "postgres")
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"


@pytest.fixture(scope="module")
def live_engine():
    url = _get_database_url()
    if not url:
        pytest.skip("DATABASE_HOST not set — skipping live schema drift tests")

    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("Cannot connect to database — skipping live schema drift tests")

    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def db_inspector(live_engine):
    return inspect(live_engine)


MANAGED_TABLES = {
    "users",
    "documents",
    "document_chunks",
    "categories",
    "tags",
    "document_tags",
}


class TestLiveSchemaDrift:
    """Compare model metadata against the actual database schema."""

    def test_all_model_tables_exist_in_database(self, db_inspector):
        db_tables = set(db_inspector.get_table_names())
        for table_name in MANAGED_TABLES:
            assert table_name in db_tables, (
                f"Table '{table_name}' is defined in SQLAlchemy models but "
                f"does not exist in the database. Was a TypeORM migration missed?"
            )

    @pytest.mark.parametrize("table_name", sorted(MANAGED_TABLES))
    def test_no_columns_missing_in_database(self, db_inspector, table_name):
        db_columns = {col["name"] for col in db_inspector.get_columns(table_name)}
        model_table = Base.metadata.tables.get(table_name)
        if model_table is None:
            pytest.skip(f"No model for table {table_name}")

        model_columns = {col.name for col in model_table.columns}
        missing = model_columns - db_columns
        assert not missing, (
            f"Columns {missing} are defined in the SQLAlchemy model for '{table_name}' "
            f"but do not exist in the database. The TypeORM entity may have been changed."
        )

    @pytest.mark.parametrize("table_name", sorted(MANAGED_TABLES))
    def test_no_columns_missing_in_model(self, db_inspector, table_name):
        db_columns = {col["name"] for col in db_inspector.get_columns(table_name)}
        model_table = Base.metadata.tables.get(table_name)
        if model_table is None:
            pytest.skip(f"No model for table {table_name}")

        model_columns = {col.name for col in model_table.columns}
        extra = db_columns - model_columns
        assert not extra, (
            f"Columns {extra} exist in database table '{table_name}' but are not "
            f"in the SQLAlchemy model. Add them to db/models.py to stay in sync."
        )

    @pytest.mark.parametrize("table_name", sorted(MANAGED_TABLES))
    def test_column_nullability_matches(self, db_inspector, table_name):
        model_table = Base.metadata.tables.get(table_name)
        if model_table is None:
            pytest.skip(f"No model for table {table_name}")

        db_columns = {col["name"]: col for col in db_inspector.get_columns(table_name)}
        mismatches = []

        for model_col in model_table.columns:
            db_col = db_columns.get(model_col.name)
            if not db_col:
                continue

            if model_col.primary_key:
                continue

            if model_col.nullable != db_col["nullable"]:
                mismatches.append(
                    f"  {model_col.name}: model={'nullable' if model_col.nullable else 'NOT NULL'}, "
                    f"db={'nullable' if db_col['nullable'] else 'NOT NULL'}"
                )

        assert not mismatches, f"Nullability mismatch in '{table_name}':\n" + "\n".join(mismatches)
