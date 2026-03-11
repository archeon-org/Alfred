from __future__ import annotations

from collections import defaultdict

from rag.types import RetrievedChunk


class RerankAgent:
    def rerank(self, *, chunks: list[RetrievedChunk], limit: int) -> list[RetrievedChunk]:
        if not chunks:
            return []

        by_document_count: dict[str, int] = defaultdict(int)
        selected: list[RetrievedChunk] = []

        for chunk in sorted(chunks, key=lambda item: item.merged_score, reverse=True):
            if by_document_count[chunk.document_id] >= 4:
                continue
            selected.append(chunk)
            by_document_count[chunk.document_id] += 1
            if len(selected) >= limit:
                break

        return selected
