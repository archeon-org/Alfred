from __future__ import annotations

from core.config import get_settings
from core.logging import get_logger
from rag.embedding_client import RagEmbeddingClient
from rag.types import ChunkCandidate, ChunkForIndexing

logger = get_logger(__name__)


class EmbeddingAgent:
    def __init__(
        self,
        embedding_client: RagEmbeddingClient,
        batch_size: int = 48,
    ) -> None:
        self._embedding_client = embedding_client
        self._batch_size = batch_size
        self._model = get_settings().ai.embedding_model

    async def embed_chunks(
        self,
        *,
        user_id: str,
        chunks: list[ChunkCandidate],
    ) -> list[ChunkForIndexing]:
        if not chunks:
            return []

        indexed: list[ChunkForIndexing] = []
        for start in range(0, len(chunks), self._batch_size):
            batch = chunks[start : start + self._batch_size]
            texts = [chunk.content for chunk in batch]
            vectors = await self._embedding_client.embed_texts(user_id=user_id, texts=texts)
            for chunk, vector in zip(batch, vectors, strict=True):
                indexed.append(
                    ChunkForIndexing(
                        chunk_index=chunk.chunk_index,
                        content=chunk.content,
                        token_count=chunk.token_count,
                        start_offset=chunk.start_offset,
                        end_offset=chunk.end_offset,
                        content_hash=chunk.content_hash,
                        embedding=vector,
                        model=self._model,
                    )
                )

        logger.info(
            "Embedding complete",
            chunk_count=len(indexed),
            model=self._model,
        )
        return indexed
