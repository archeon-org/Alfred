"""Tests that verify the SQLAlchemy models are correctly defined and stay in
sync with the TypeORM entity definitions in packages/database/."""

from __future__ import annotations

from pathlib import Path

import pytest

from db.base import Base

TYPEORM_ENTITY_DIR = (
    Path(__file__).resolve().parents[3] / "packages" / "database" / "src" / "entities"
)


class TestModelTableMapping:
    """Verify every expected table exists in the metadata."""

    EXPECTED_TABLES = {
        "users",
        "documents",
        "document_chunks",
        "categories",
        "tags",
        "document_tags",
        "templates",
        "template_categories",
        "template_tags",
        "notifications",
    }

    def test_all_expected_tables_are_registered(self):
        registered = set(Base.metadata.tables.keys())
        missing = self.EXPECTED_TABLES - registered
        assert not missing, f"Missing table models: {missing}"

    def test_no_unexpected_tables(self):
        registered = set(Base.metadata.tables.keys())
        extra = registered - self.EXPECTED_TABLES
        assert not extra, f"Unexpected extra tables registered: {extra}"


class TestDocumentChunkColumns:
    """Column-by-column parity check for document_chunks."""

    EXPECTED_COLUMNS = {
        "id",
        "documentId",
        "userId",
        "chunkIndex",
        "content",
        "contentHash",
        "tokenCount",
        "startOffset",
        "endOffset",
        "embedding",
        "model",
        "metadata",
        "createdAt",
        "updatedAt",
    }

    def test_columns_match(self):
        table = Base.metadata.tables["document_chunks"]
        model_cols = {c.name for c in table.columns}
        assert model_cols == self.EXPECTED_COLUMNS

    def test_primary_key(self):
        table = Base.metadata.tables["document_chunks"]
        pk_cols = {c.name for c in table.primary_key.columns}
        assert pk_cols == {"id"}

    def test_unique_constraint_on_document_chunk_index(self):
        table = Base.metadata.tables["document_chunks"]
        unique_constraints = [
            c for c in table.constraints if hasattr(c, "columns") and len(c.columns) == 2
        ]
        unique_col_sets = [frozenset(col.name for col in c.columns) for c in unique_constraints]
        assert frozenset({"documentId", "chunkIndex"}) in unique_col_sets


class TestDocumentColumns:
    EXPECTED_COLUMNS = {
        "id",
        "filename",
        "originalName",
        "mimetype",
        "size",
        "path",
        "thumbnailPath",
        "title",
        "description",
        "content",
        "search_vector",
        "metadata",
        "isProcessed",
        "processingStatus",
        "classificationSource",
        "createdAt",
        "updatedAt",
        "deletedAt",
        "userId",
        "categoryId",
    }

    def test_columns_match(self):
        table = Base.metadata.tables["documents"]
        model_cols = {c.name for c in table.columns}
        assert model_cols == self.EXPECTED_COLUMNS


class TestCategoryColumns:
    EXPECTED_COLUMNS = {
        "id",
        "name",
        "icon",
        "color",
        "order",
        "isSystemDefault",
        "parentId",
        "userId",
        "createdAt",
        "updatedAt",
    }

    def test_columns_match(self):
        table = Base.metadata.tables["categories"]
        model_cols = {c.name for c in table.columns}
        assert model_cols == self.EXPECTED_COLUMNS


class TestTagColumns:
    EXPECTED_COLUMNS = {
        "id",
        "name",
        "color",
        "order",
        "isSystemDefault",
        "userId",
        "createdAt",
        "updatedAt",
    }

    def test_columns_match(self):
        table = Base.metadata.tables["tags"]
        model_cols = {c.name for c in table.columns}
        assert model_cols == self.EXPECTED_COLUMNS


class TestDocumentTagColumns:
    EXPECTED_COLUMNS = {"documentId", "tagId"}

    def test_columns_match(self):
        table = Base.metadata.tables["document_tags"]
        model_cols = {c.name for c in table.columns}
        assert model_cols == self.EXPECTED_COLUMNS

    def test_composite_primary_key(self):
        table = Base.metadata.tables["document_tags"]
        pk_cols = {c.name for c in table.primary_key.columns}
        assert pk_cols == {"documentId", "tagId"}


class TestForeignKeys:
    """Verify relationship integrity between models."""

    def _get_fk_targets(self, table_name: str) -> set[str]:
        table = Base.metadata.tables[table_name]
        return {f"{fk.column.table.name}.{fk.column.name}" for fk in table.foreign_keys}

    def test_document_chunks_foreign_keys(self):
        fks = self._get_fk_targets("document_chunks")
        assert "documents.id" in fks
        assert "users.id" in fks

    def test_documents_foreign_keys(self):
        fks = self._get_fk_targets("documents")
        assert "users.id" in fks
        assert "categories.id" in fks

    def test_document_tags_foreign_keys(self):
        fks = self._get_fk_targets("document_tags")
        assert "documents.id" in fks
        assert "tags.id" in fks

    def test_categories_foreign_keys(self):
        fks = self._get_fk_targets("categories")
        assert "users.id" in fks
        assert "categories.id" in fks

    def test_tags_foreign_keys(self):
        fks = self._get_fk_targets("tags")
        assert "users.id" in fks


class TestTypeORMEntityParity:
    """Cross-reference TypeORM entity files exist for each model table.

    This test ensures that if a new TypeORM entity is added, the developer
    is reminded to add a corresponding SQLAlchemy model.
    """

    ENTITY_FILE_MAP = {
        "users": "user.entity.ts",
        "documents": "document.entity.ts",
        "document_chunks": "document-chunk.entity.ts",
        "categories": "category.entity.ts",
        "tags": "tag.entity.ts",
        "templates": "template.entity.ts",
        "template_tags": "template-tag.entity.ts",
        "template_categories": "template-category.entity.ts",
        "notifications": "notification.entity.ts",
    }

    def test_typeorm_entity_files_exist(self):
        if not TYPEORM_ENTITY_DIR.is_dir():
            pytest.skip("TypeORM entities directory not found (expected in monorepo)")

        for table_name, entity_file in self.ENTITY_FILE_MAP.items():
            entity_path = TYPEORM_ENTITY_DIR / entity_file
            assert entity_path.exists(), (
                f"TypeORM entity file '{entity_file}' not found for table '{table_name}'. "
                f"If it was renamed or removed, update the SQLAlchemy model in db/models.py."
            )

    def test_no_unmapped_typeorm_entities(self):
        """Warn if a TypeORM entity exists that has no SQLAlchemy counterpart."""
        if not TYPEORM_ENTITY_DIR.is_dir():
            pytest.skip("TypeORM entities directory not found (expected in monorepo)")

        known_entity_files = set(self.ENTITY_FILE_MAP.values())
        skipped = set()

        for ts_file in TYPEORM_ENTITY_DIR.glob("*.entity.ts"):
            if ts_file.name in known_entity_files or ts_file.name in skipped:
                continue
            pytest.fail(
                f"TypeORM entity '{ts_file.name}' has no corresponding SQLAlchemy model. "
                f"Add a model to db/models.py if Scribe needs to access this table."
            )
