from __future__ import annotations

from core.logging import get_logger
from rag.embedding_client import RagEmbeddingClient
from rag.repositories.chunk_repository import fts_retrieve_chunks, vector_retrieve_chunks
from rag.types import RagSearchMode, RetrievedChunk

logger = get_logger(__name__)


class HybridRetrieveAgent:
    def __init__(self, embedding_client: RagEmbeddingClient) -> None:
        self._embedding_client = embedding_client

    async def retrieve(
        self,
        *,
        user_id: str,
        query: str,
        mode: RagSearchMode,
        limit: int,
    ) -> list[RetrievedChunk]:
        expanded_limit = max(limit * 5, 20)

        vector_hits: list[RetrievedChunk] = []
        keyword_hits: list[RetrievedChunk] = []

        if mode in {"hybrid", "semantic"}:
            vector = (await self._embedding_client.embed_texts(user_id=user_id, texts=[query]))[0]
            vector_hits = await vector_retrieve_chunks(
                user_id=user_id, embedding=vector, limit=expanded_limit
            )

        if mode in {"hybrid", "keyword"}:
            keyword_hits = await fts_retrieve_chunks(
                user_id=user_id, query=query, limit=expanded_limit
            )

        merged = self._merge(vector_hits, keyword_hits, query)

        logger.info(
            "Hybrid retrieval complete",
            mode=mode,
            query_len=len(query),
            vector_hits=len(vector_hits),
            keyword_hits=len(keyword_hits),
            merged_hits=len(merged),
        )
        return merged

    @staticmethod
    def _normalize(scores: list[float]) -> list[float]:
        if not scores:
            return []
        low = min(scores)
        high = max(scores)
        if high - low < 1e-9:
            return [1.0 for _ in scores]
        return [(value - low) / (high - low) for value in scores]

    def _merge(
        self,
        vector_hits: list[RetrievedChunk],
        keyword_hits: list[RetrievedChunk],
        query: str,
    ) -> list[RetrievedChunk]:
        by_chunk: dict[str, RetrievedChunk] = {}

        vector_norm = self._normalize([hit.score for hit in vector_hits])
        for hit, normalized in zip(vector_hits, vector_norm, strict=True):
            hit.vector_score = max(0.0, min(1.0, normalized))
            existing = by_chunk.get(hit.chunk_id)
            if existing is None:
                by_chunk[hit.chunk_id] = hit
            else:
                existing.vector_score = max(existing.vector_score, hit.vector_score)

        keyword_norm = self._normalize([hit.score for hit in keyword_hits])
        for hit, normalized in zip(keyword_hits, keyword_norm, strict=True):
            hit.keyword_score = max(0.0, min(1.0, normalized))
            existing = by_chunk.get(hit.chunk_id)
            if existing is None:
                by_chunk[hit.chunk_id] = hit
            else:
                existing.keyword_score = max(existing.keyword_score, hit.keyword_score)

        terms = [term for term in query.lower().split() if len(term) >= 3]

        merged: list[RetrievedChunk] = []
        for chunk in by_chunk.values():
            weighted = (0.7 * chunk.vector_score) + (0.3 * chunk.keyword_score)
            title_source = f"{chunk.title or ''} {chunk.original_name or ''}".lower()
            title_boost = 0.03 if terms and any(term in title_source for term in terms) else 0.0
            chunk.merged_score = max(0.0, min(1.0, weighted + title_boost))
            chunk.score = chunk.merged_score
            merged.append(chunk)

        merged.sort(key=lambda item: item.merged_score, reverse=True)
        return merged
