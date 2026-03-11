from __future__ import annotations

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from core.database import get_async_db_session
from core.logging import get_logger
from db.models import Document, DocumentChunk
from rag.types import ChunkForIndexing, RetrievedChunk

logger = get_logger(__name__)


class ChunkRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_document_content(
        self,
        document_id: str,
        user_id: str,
    ) -> tuple[str, str | None, str | None] | None:
        stmt = select(Document.content, Document.title, Document.originalName).where(
            Document.id == document_id,
            Document.userId == user_id,
            Document.deletedAt.is_(None),
        )
        row = self._session.execute(stmt).first()
        if not row or not row[0]:
            return None
        return row[0], row[1], row[2]

    def get_existing_hashes(self, document_id: str) -> dict[int, str]:
        stmt = select(DocumentChunk.chunkIndex, DocumentChunk.contentHash).where(
            DocumentChunk.documentId == document_id
        )
        rows = self._session.execute(stmt).all()
        return {int(row[0]): str(row[1]) for row in rows}

    def upsert_chunks(
        self,
        *,
        document_id: str,
        user_id: str,
        chunks: list[ChunkForIndexing],
    ) -> tuple[int, int, int]:
        existing_hashes = self.get_existing_hashes(document_id)
        seen_indices: set[int] = set()
        upserted = 0
        skipped = 0
        deleted = 0

        for chunk in chunks:
            seen_indices.add(chunk.chunk_index)
            existing_hash = existing_hashes.get(chunk.chunk_index)
            if existing_hash == chunk.content_hash:
                skipped += 1
                continue

            table = DocumentChunk.__table__
            values = {
                "documentId": document_id,
                "userId": user_id,
                "chunkIndex": chunk.chunk_index,
                "content": chunk.content,
                "contentHash": chunk.content_hash,
                "tokenCount": chunk.token_count,
                "startOffset": chunk.start_offset,
                "endOffset": chunk.end_offset,
                "embedding": chunk.embedding,
                "model": chunk.model,
                "metadata": {},
            }
            stmt = pg_insert(table).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[table.c.documentId, table.c.chunkIndex],
                set_={
                    "content": stmt.excluded.content,
                    "contentHash": stmt.excluded.contentHash,
                    "tokenCount": stmt.excluded.tokenCount,
                    "startOffset": stmt.excluded.startOffset,
                    "endOffset": stmt.excluded.endOffset,
                    "embedding": stmt.excluded.embedding,
                    "model": stmt.excluded.model,
                    "metadata": stmt.excluded.metadata,
                    "updatedAt": text("NOW()"),
                },
            )
            self._session.execute(stmt)
            upserted += 1

        if seen_indices:
            del_stmt = delete(DocumentChunk).where(
                DocumentChunk.documentId == document_id,
                DocumentChunk.userId == user_id,
                DocumentChunk.chunkIndex.not_in(sorted(seen_indices)),
            )
            delete_result = self._session.execute(del_stmt)
            deleted = int(delete_result.rowcount or 0)
        else:
            deleted = self.delete_document_chunks(document_id=document_id, user_id=user_id)

        self._session.commit()
        return upserted, skipped, deleted

    def delete_document_chunks(self, *, document_id: str, user_id: str) -> int:
        stmt = delete(DocumentChunk).where(
            DocumentChunk.documentId == document_id,
            DocumentChunk.userId == user_id,
        )
        result = self._session.execute(stmt)
        self._session.commit()
        return int(result.rowcount or 0)

    def fetch_backfill_candidates(self, batch_size: int) -> list[tuple[str, str]]:
        subq = (
            select(DocumentChunk.documentId)
            .where(DocumentChunk.documentId == Document.id)
            .correlate(Document)
            .exists()
        )

        stmt = (
            select(Document.id, Document.userId)
            .where(
                Document.isProcessed.is_(True),
                Document.content.isnot(None),
                Document.deletedAt.is_(None),
                ~subq,
            )
            .order_by(Document.createdAt.asc())
            .limit(batch_size)
        )
        rows = self._session.execute(stmt).all()
        return [(str(row[0]), str(row[1])) for row in rows]


async def vector_retrieve_chunks(
    *,
    user_id: str,
    embedding: list[float],
    limit: int,
) -> list[RetrievedChunk]:
    async with get_async_db_session() as session:
        stmt = (
            select(
                DocumentChunk.id.label("chunk_id"),
                DocumentChunk.documentId.label("document_id"),
                DocumentChunk.content,
                DocumentChunk.startOffset.label("start_offset"),
                DocumentChunk.endOffset.label("end_offset"),
                Document.title,
                Document.originalName.label("original_name"),
                (1 - DocumentChunk.embedding.cosine_distance(embedding)).label("score"),
            )
            .join(Document, Document.id == DocumentChunk.documentId)
            .where(
                DocumentChunk.userId == user_id,
                Document.deletedAt.is_(None),
            )
            .order_by(DocumentChunk.embedding.cosine_distance(embedding))
            .limit(limit)
        )
        result = await session.execute(stmt)
        rows = result.mappings().all()

    return [
        RetrievedChunk(
            chunk_id=str(row["chunk_id"]),
            document_id=str(row["document_id"]),
            content=str(row["content"]),
            score=float(row["score"] or 0.0),
            start_offset=int(row["start_offset"]),
            end_offset=int(row["end_offset"]),
            title=row["title"],
            original_name=row["original_name"],
        )
        for row in rows
    ]


async def fts_retrieve_chunks(
    *,
    user_id: str,
    query: str,
    limit: int,
) -> list[RetrievedChunk]:
    async with get_async_db_session() as session:
        ts_query = func.websearch_to_tsquery("simple", query)
        ts_vector = func.to_tsvector("simple", DocumentChunk.content)
        score = func.ts_rank_cd(ts_vector, ts_query).label("score")

        stmt = (
            select(
                DocumentChunk.id.label("chunk_id"),
                DocumentChunk.documentId.label("document_id"),
                DocumentChunk.content,
                DocumentChunk.startOffset.label("start_offset"),
                DocumentChunk.endOffset.label("end_offset"),
                Document.title,
                Document.originalName.label("original_name"),
                score,
            )
            .join(Document, Document.id == DocumentChunk.documentId)
            .where(
                DocumentChunk.userId == user_id,
                Document.deletedAt.is_(None),
                ts_vector.op("@@")(ts_query),
            )
            .order_by(score.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        rows = result.mappings().all()

    return [
        RetrievedChunk(
            chunk_id=str(row["chunk_id"]),
            document_id=str(row["document_id"]),
            content=str(row["content"]),
            score=float(row["score"] or 0.0),
            start_offset=int(row["start_offset"]),
            end_offset=int(row["end_offset"]),
            title=row["title"],
            original_name=row["original_name"],
        )
        for row in rows
    ]
