"""Tests for ChunkRepository using the ORM-based implementation.

Note: vector operations (pgvector) and full-text search (tsvector) are
PostgreSQL-specific and are not testable with SQLite. Those code paths
are covered by the test_models.py schema parity checks and by integration
tests against a real database.
"""

from __future__ import annotations

import uuid
from datetime import UTC

from sqlalchemy import select

from db.models import Document, DocumentChunk, User
from rag.repositories.chunk_repository import ChunkRepository
from rag.types import ChunkForIndexing


def _seed_user(session, user_id: str) -> None:
    session.add(
        User(
            id=user_id,
            email=f"{user_id[:8]}@test.com",
            firstName="Test",
            lastName="User",
            provider="EMAIL",
            storageLimit=1_000_000,
        )
    )
    session.flush()


def _seed_document(
    session,
    document_id: str,
    user_id: str,
    content: str | None = "Some document content",
    is_processed: bool = True,
) -> None:
    session.add(
        Document(
            id=document_id,
            userId=user_id,
            filename="test.pdf",
            originalName="test_original.pdf",
            mimetype="application/pdf",
            size=1024,
            path="uploads/test.pdf",
            content=content,
            title="Test Document",
            isProcessed=is_processed,
        )
    )
    session.flush()


def _make_chunk(
    index: int,
    content: str = "chunk content",
    embedding: list[float] | None = None,
) -> ChunkForIndexing:
    return ChunkForIndexing(
        chunk_index=index,
        content=content,
        token_count=len(content.split()),
        start_offset=index * 100,
        end_offset=index * 100 + len(content),
        content_hash=f"hash_{index}_{content[:10]}",
        embedding=embedding or [0.1] * 1536,
        model="test-model",
    )


def _seed_chunk(session, document_id: str, user_id: str, chunk_index: int) -> None:
    session.add(
        DocumentChunk(
            documentId=document_id,
            userId=user_id,
            chunkIndex=chunk_index,
            content=f"chunk {chunk_index}",
            contentHash=f"hash_{chunk_index}",
            tokenCount=2,
            startOffset=chunk_index * 100,
            endOffset=chunk_index * 100 + 50,
            embedding=[0.0] * 1536,
            model="test-model",
        )
    )
    session.flush()


class TestGetDocumentContent:
    def test_returns_content_tuple(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, content="hello world")

        repo = ChunkRepository(session)
        result = repo.get_document_content(sample_document_id, sample_user_id)

        assert result is not None
        content, title, original_name = result
        assert content == "hello world"
        assert title == "Test Document"
        assert original_name == "test_original.pdf"

    def test_returns_none_for_different_user(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        other_user_id = str(uuid.uuid4())
        _seed_user(session, other_user_id)

        repo = ChunkRepository(session)
        assert repo.get_document_content(sample_document_id, other_user_id) is None

    def test_returns_none_for_deleted_document(self, session, sample_user_id, sample_document_id):
        from datetime import datetime

        _seed_user(session, sample_user_id)
        session.add(
            Document(
                id=sample_document_id,
                userId=sample_user_id,
                filename="test.pdf",
                originalName="test.pdf",
                mimetype="application/pdf",
                size=1024,
                path="uploads/test.pdf",
                content="deleted doc",
                deletedAt=datetime.now(UTC),
            )
        )
        session.flush()

        repo = ChunkRepository(session)
        assert repo.get_document_content(sample_document_id, sample_user_id) is None

    def test_returns_none_when_content_is_null(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, content=None)

        repo = ChunkRepository(session)
        assert repo.get_document_content(sample_document_id, sample_user_id) is None


class TestGetExistingHashes:
    def test_returns_hash_map(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)
        _seed_chunk(session, sample_document_id, sample_user_id, 0)
        _seed_chunk(session, sample_document_id, sample_user_id, 1)

        repo = ChunkRepository(session)
        hashes = repo.get_existing_hashes(sample_document_id)

        assert len(hashes) == 2
        assert hashes[0] == "hash_0"
        assert hashes[1] == "hash_1"

    def test_returns_empty_for_no_chunks(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)

        repo = ChunkRepository(session)
        assert repo.get_existing_hashes(sample_document_id) == {}


class TestDeleteDocumentChunks:
    def test_deletes_all_chunks_for_document(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id)
        _seed_chunk(session, sample_document_id, sample_user_id, 0)
        _seed_chunk(session, sample_document_id, sample_user_id, 1)

        repo = ChunkRepository(session)
        deleted = repo.delete_document_chunks(
            document_id=sample_document_id, user_id=sample_user_id
        )

        assert deleted == 2
        remaining = session.execute(
            select(DocumentChunk).where(DocumentChunk.documentId == sample_document_id)
        ).all()
        assert len(remaining) == 0

    def test_does_not_delete_other_users_chunks(self, session, sample_user_id, sample_document_id):
        other_user = str(uuid.uuid4())
        other_doc = str(uuid.uuid4())
        _seed_user(session, sample_user_id)
        _seed_user(session, other_user)
        _seed_document(session, sample_document_id, sample_user_id)
        _seed_document(session, other_doc, other_user)
        _seed_chunk(session, sample_document_id, sample_user_id, 0)
        _seed_chunk(session, other_doc, other_user, 0)

        repo = ChunkRepository(session)
        repo.delete_document_chunks(document_id=sample_document_id, user_id=sample_user_id)

        remaining = session.execute(
            select(DocumentChunk).where(DocumentChunk.documentId == other_doc)
        ).all()
        assert len(remaining) == 1


class TestFetchBackfillCandidates:
    def test_finds_processed_documents_without_chunks(
        self, session, sample_user_id, sample_document_id
    ):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, is_processed=True)

        repo = ChunkRepository(session)
        candidates = repo.fetch_backfill_candidates(batch_size=10)

        assert len(candidates) == 1
        assert candidates[0][0] == sample_document_id

    def test_excludes_documents_with_chunks(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, is_processed=True)
        _seed_chunk(session, sample_document_id, sample_user_id, 0)

        repo = ChunkRepository(session)
        candidates = repo.fetch_backfill_candidates(batch_size=10)

        assert len(candidates) == 0

    def test_excludes_unprocessed_documents(self, session, sample_user_id, sample_document_id):
        _seed_user(session, sample_user_id)
        _seed_document(session, sample_document_id, sample_user_id, is_processed=False)

        repo = ChunkRepository(session)
        candidates = repo.fetch_backfill_candidates(batch_size=10)

        assert len(candidates) == 0

    def test_respects_batch_size(self, session, sample_user_id):
        _seed_user(session, sample_user_id)
        for _i in range(5):
            doc_id = str(uuid.uuid4())
            _seed_document(session, doc_id, sample_user_id, is_processed=True)

        repo = ChunkRepository(session)
        candidates = repo.fetch_backfill_candidates(batch_size=2)

        assert len(candidates) == 2
