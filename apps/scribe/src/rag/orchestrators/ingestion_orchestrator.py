from __future__ import annotations

from sqlalchemy.orm import Session

from core.logging import get_logger
from rag.agents import (
    ChunkingAgent,
    ContentPreparationAgent,
    EmbeddingAgent,
    QualityAgent,
    StorageAgent,
)
from rag.embedding_client import RagEmbeddingClient, get_rag_embedding_client
from rag.repositories.chunk_repository import ChunkRepository

logger = get_logger(__name__)


class IngestionOrchestrator:
    def __init__(self, embedding_client: RagEmbeddingClient | None = None) -> None:
        embedding_client = embedding_client or get_rag_embedding_client()
        self._content_agent = ContentPreparationAgent()
        self._chunking_agent = ChunkingAgent()
        self._embedding_agent = EmbeddingAgent(embedding_client=embedding_client)
        self._storage_agent = StorageAgent()
        self._quality_agent = QualityAgent()

    async def run(
        self,
        *,
        session: Session,
        document_id: str,
        user_id: str,
    ) -> dict[str, object]:
        repository = ChunkRepository(session)

        content_row = repository.get_document_content(document_id=document_id, user_id=user_id)
        if content_row is None:
            raise ValueError("Document is missing content or is not available")

        content, title, original_name = content_row
        prepared = self._content_agent.prepare(
            content=content,
            title=title,
            original_name=original_name,
        )

        chunks = self._chunking_agent.chunk(
            content=prepared.text,
            document_name=prepared.title,
            document_id=document_id,
        )

        indexed_chunks = await self._embedding_agent.embed_chunks(user_id=user_id, chunks=chunks)

        storage_stats = self._storage_agent.store_chunks(
            repository=repository,
            document_id=document_id,
            user_id=user_id,
            chunks=indexed_chunks,
        )

        quality = self._quality_agent.assess(
            chunks=indexed_chunks,
            upserted=storage_stats["upserted"],
            skipped=storage_stats["skipped"],
            deleted=storage_stats["deleted"],
        )

        result = {
            "document_id": document_id,
            "user_id": user_id,
            "title": prepared.title,
            "original_name": prepared.original_name,
            **storage_stats,
            **quality,
        }
        logger.info("Ingestion orchestration complete", **result)
        return result
