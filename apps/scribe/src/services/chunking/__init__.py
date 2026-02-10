"""
Document Chunking Service

Provides utilities for splitting documents into chunks for better
knowledge graph ingestion with Graphiti.
"""

from services.chunking.chunker import (
    DocumentChunker,
    DocumentChunk,
    should_chunk_document,
)

__all__ = [
    "DocumentChunker",
    "DocumentChunk",
    "should_chunk_document",
]
