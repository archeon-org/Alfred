from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, TypedDict

RagSearchMode = Literal["hybrid", "semantic", "keyword"]
RagAgentMode = Literal["normal", "reasoning"]


class RagUserContext(TypedDict, total=False):
    user_id: str
    first_name: str
    last_name: str
    full_name: str
    email: str
    timezone: str
    locale: str
    current_date: str
    current_datetime_iso: str
    day_of_week: str


@dataclass(frozen=True, slots=True)
class PreparedContent:
    text: str
    title: str
    original_name: str


@dataclass(frozen=True, slots=True)
class ChunkCandidate:
    chunk_index: int
    content: str
    token_count: int
    start_offset: int
    end_offset: int
    content_hash: str


@dataclass(frozen=True, slots=True)
class ChunkForIndexing:
    chunk_index: int
    content: str
    token_count: int
    start_offset: int
    end_offset: int
    content_hash: str
    embedding: list[float]
    model: str


@dataclass(frozen=True, slots=True)
class RagCitation:
    chunk_id: str
    document_id: str
    snippet: str
    score: float
    start_offset: int
    end_offset: int


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    content: str
    score: float
    start_offset: int
    end_offset: int
    title: str | None
    original_name: str | None
    vector_score: float = 0.0
    keyword_score: float = 0.0
    merged_score: float = 0.0

    def display_name(self) -> str:
        return self.title or self.original_name or "Untitled document"


@dataclass(frozen=True, slots=True)
class DocumentSearchHit:
    document_id: str
    score: float
    best_snippet: str
    citations: list[RagCitation] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class RagAnswer:
    answer: str
    citations: list[RagCitation]
    confidence: str
    processing_time_ms: float
    rewritten_query: str | None = None


@dataclass(frozen=True, slots=True)
class RagAgentEvent:
    stage: str
    message: str
    metadata: dict[str, Any] = field(default_factory=dict)
