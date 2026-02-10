"""
Document Chunking Implementation using Chonkie

Provides intelligent document chunking for optimal knowledge graph ingestion.
Uses the chonkie library for efficient semantic chunking without overlap.

Key improvements:
- No overlap to prevent duplicate entity extraction
- Semantic chunking for better context preservation
- Simpler, more maintainable code
- Better performance
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class DocumentChunk:
    """Represents a single chunk of a document."""

    # The chunk content
    content: str

    # Index of this chunk (0-based)
    index: int

    # Total number of chunks in the document
    total_chunks: int

    # Character offset in original document
    start_offset: int
    end_offset: int

    # Metadata
    metadata: dict = field(default_factory=dict)

    @property
    def part_name(self) -> str:
        """Get human-readable part name like 'Part 1/5'."""
        return f"Part {self.index + 1}/{self.total_chunks}"


class DocumentChunker:
    """
    Document chunker using chonkie library for semantic chunking.
    
    Benefits:
    - No overlap = no duplicate entity extraction = lower costs
    - Semantic awareness for better context boundaries
    - Simpler implementation, battle-tested library
    """

    def __init__(self, chunk_size: int = 3000, min_chunk_size: int = 500):
        """
        Initialize chunker with chonkie.
        
        Parameters
        ----------
        chunk_size : int
            Target chunk size in tokens (default 3000 chars ≈ 750 tokens)
        min_chunk_size : int
            Minimum chunk size to avoid tiny chunks
        """
        self.chunk_size = chunk_size
        self.min_chunk_size = min_chunk_size
        
        try:
            from chonkie import TokenChunker
            # Use token-based chunking with no overlap
            self.chunker = TokenChunker(
                chunk_size=chunk_size,
                chunk_overlap=0,  # NO OVERLAP to prevent duplicate extraction
            )
        except ImportError:
            logger.warning(
                "chonkie library not installed, falling back to simple splitting"
            )
            self.chunker = None

    def chunk_document(
        self,
        text: str,
        document_name: str | None = None,
        document_id: str | None = None,
    ) -> list[DocumentChunk]:
        """
        Split a document into non-overlapping semantic chunks.

        Parameters
        ----------
        text : str
            The document text to chunk.
        document_name : str, optional
            Name of the document (for metadata).
        document_id : str, optional
            ID of the document (for metadata).

        Returns
        -------
        list[DocumentChunk]
            List of document chunks with metadata.
        """
        if not text or not text.strip():
            return []

        text = text.strip()

        # For small documents, return as single chunk
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

        # Use chonkie for intelligent chunking
        if self.chunker:
            chunks = self._chunk_with_chonkie(text)
        else:
            # Fallback to simple splitting
            chunks = self._chunk_simple(text)

        # Build result with metadata
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
                "avg_chunk_size_tokens_est": (len(text) // 4) // total_chunks if total_chunks > 0 else 0,
                "chunking_method": "chonkie_semantic",
                "overlap": "none",
            },
        )

        return result

    def _chunk_with_chonkie(self, text: str) -> list[tuple[str, int, int]]:
        """
        Chunk text using chonkie library.
        
        Returns list of (content, start_offset, end_offset) tuples.
        """
        try:
            # Chonkie returns Chunk objects with text and metadata
            chonkie_chunks = self.chunker.chunk(text)
            
            result = []
            current_pos = 0
            
            for chunk in chonkie_chunks:
                chunk_text = chunk.text.strip()
                if not chunk_text or len(chunk_text) < self.min_chunk_size:
                    continue
                
                # Find position in original text
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
        """
        Simple fallback chunking by character count.
        
        Returns list of (content, start_offset, end_offset) tuples.
        """
        chunks = []
        start = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))
            
            # Try to break at sentence boundary (period followed by space and capital)
            if end < len(text):
                # Look for sentence end in last 20% of chunk
                search_start = start + int(self.chunk_size * 0.8)
                search_text = text[search_start:end + 100]  # Look ahead a bit
                
                # Find last sentence boundary
                import re
                matches = list(re.finditer(r'[.!?]\s+(?=[A-Z])', search_text))
                if matches:
                    last_match = matches[-1]
                    end = search_start + last_match.end()

            chunk_text = text[start:end].strip()
            if chunk_text and len(chunk_text) >= self.min_chunk_size:
                chunks.append((chunk_text, start, end))
            
            start = end

        return chunks


def should_chunk_document(content: str, threshold: int = 10000) -> bool:
    """
    Determine if a document should be chunked based on its size.
    
    IMPORTANT: Increased threshold to 10000 to reduce chunking.
    Most resumes are 4000-6000 chars, so they won't be chunked.
    Research papers (~15000-25000 chars) will still be chunked.
    Fewer chunks = fewer LLM calls = lower costs.

    Parameters
    ----------
    content : str
        The document content.
    threshold : int
        Size threshold in characters. Default is 10000.

    Returns
    -------
    bool
        True if document should be chunked.
    """
    return len(content) > threshold
