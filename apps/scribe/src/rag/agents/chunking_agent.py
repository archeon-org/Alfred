from __future__ import annotations

import hashlib

from core.logging import get_logger
from rag.types import ChunkCandidate
from services.chunking.chunker import DocumentChunker

logger = get_logger(__name__)


class ChunkingAgent:
    def __init__(self, chunk_size: int = 1400, min_chunk_size: int = 250) -> None:
        self._chunker = DocumentChunker(chunk_size=chunk_size, min_chunk_size=min_chunk_size)

    def chunk(self, *, content: str, document_name: str, document_id: str) -> list[ChunkCandidate]:
        chunks = self._chunker.chunk_document(
            text=content,
            document_name=document_name,
            document_id=document_id,
        )
        result: list[ChunkCandidate] = []
        for chunk in chunks:
            normalized = chunk.content.strip()
            if not normalized:
                continue
            content_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            result.append(
                ChunkCandidate(
                    chunk_index=chunk.index,
                    content=normalized,
                    token_count=self._estimate_tokens(normalized),
                    start_offset=chunk.start_offset,
                    end_offset=chunk.end_offset,
                    content_hash=content_hash,
                )
            )

        logger.info(
            "Chunking complete",
            chunk_count=len(result),
            doc_id=document_id,
        )
        return result

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(1, len(text) // 4)
