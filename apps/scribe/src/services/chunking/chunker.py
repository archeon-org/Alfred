from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class DocumentChunk:
    content: str

    index: int

    total_chunks: int

    start_offset: int
    end_offset: int

    metadata: dict = field(default_factory=dict)

    @property
    def part_name(self) -> str:
        return f"Part {self.index + 1}/{self.total_chunks}"


class DocumentChunker:
    def __init__(self, chunk_size: int = 3000, min_chunk_size: int = 500):
        self.chunk_size = chunk_size
        self.min_chunk_size = min_chunk_size

        try:
            from chonkie import TokenChunker

            self.chunker = TokenChunker(
                chunk_size=chunk_size,
                chunk_overlap=0,
            )
        except ImportError:
            logger.warning("chonkie library not installed, falling back to simple splitting")
            self.chunker = None

    def chunk_document(
        self,
        text: str,
        document_name: str | None = None,
        document_id: str | None = None,
    ) -> list[DocumentChunk]:
        if not text or not text.strip():
            return []

        text = text.strip()

        if len(text) <= self.chunk_size:
            return [
                DocumentChunk(
                    content=text,
                    index=0,
                    total_chunks=1,
                    start_offset=0,
                    end_offset=len(text),
                    metadata={
                        "document_name": document_name,
                        "document_id": document_id,
                    },
                )
            ]

        if self.chunker:
            chunks = self._chunk_with_chonkie(text)
        else:
            chunks = self._chunk_simple(text)

        total_chunks = len(chunks)
        result = []

        for i, (content, start, end) in enumerate(chunks):
            result.append(
                DocumentChunk(
                    content=content,
                    index=i,
                    total_chunks=total_chunks,
                    start_offset=start,
                    end_offset=end,
                    metadata={
                        "document_name": document_name,
                        "document_id": document_id,
                    },
                )
            )

        logger.info(
            f"\ud83e\udd9b Chonkie chunked document: {document_name}",
            extra={
                "document_name": document_name,
                "document_id": document_id,
                "total_length_chars": len(text),
                "total_length_tokens_est": len(text) // 4,
                "chunk_count": total_chunks,
                "avg_chunk_size_chars": len(text) // total_chunks if total_chunks > 0 else 0,
                "avg_chunk_size_tokens_est": (len(text) // 4) // total_chunks
                if total_chunks > 0
                else 0,
                "chunking_method": "chonkie_semantic",
                "overlap": "none",
            },
        )

        return result

    def _chunk_with_chonkie(self, text: str) -> list[tuple[str, int, int]]:
        try:
            chonkie_chunks = self.chunker.chunk(text)  # type: ignore[union-attr]

            result = []
            current_pos = 0

            for chunk in chonkie_chunks:
                chunk_text = chunk.text.strip()
                if not chunk_text or len(chunk_text) < self.min_chunk_size:
                    continue

                start = text.find(chunk_text, current_pos)
                if start == -1:
                    start = current_pos
                end = start + len(chunk_text)

                result.append((chunk_text, start, end))
                current_pos = end

            return result
        except Exception as e:
            logger.warning(f"Chonkie chunking failed: {e}, falling back to simple")
            return self._chunk_simple(text)

    def _chunk_simple(self, text: str) -> list[tuple[str, int, int]]:
        chunks = []
        start = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            if end < len(text):
                search_start = start + int(self.chunk_size * 0.8)
                search_text = text[search_start : end + 100]

                import re

                matches = list(re.finditer(r"[.!?]\s+(?=[A-Z])", search_text))
                if matches:
                    last_match = matches[-1]
                    end = search_start + last_match.end()

            chunk_text = text[start:end].strip()
            if chunk_text and len(chunk_text) >= self.min_chunk_size:
                chunks.append((chunk_text, start, end))

            start = end

        return chunks


def should_chunk_document(content: str, threshold: int = 10000) -> bool:
    return len(content) > threshold
