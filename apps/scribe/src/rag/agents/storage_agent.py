from __future__ import annotations

from core.logging import get_logger
from rag.repositories.chunk_repository import ChunkRepository
from rag.types import ChunkForIndexing

logger = get_logger(__name__)


class StorageAgent:
    def store_chunks(
        self,
        *,
        repository: ChunkRepository,
        document_id: str,
        user_id: str,
        chunks: list[ChunkForIndexing],
    ) -> dict[str, int]:
        upserted, skipped, deleted = repository.upsert_chunks(
            document_id=document_id,
            user_id=user_id,
            chunks=chunks,
        )

        logger.info(
            "Chunk storage complete",
            document_id=document_id,
            upserted=upserted,
            skipped=skipped,
            deleted=deleted,
        )
        return {
            "upserted": upserted,
            "skipped": skipped,
            "deleted": deleted,
        }
