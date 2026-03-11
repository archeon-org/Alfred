from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

RagSearchMode = Literal["hybrid", "semantic", "keyword"]
RagAgentMode = Literal["normal", "reasoning"]


class RagCitationSchema(BaseModel):
    chunk_id: str
    document_id: str
    snippet: str
    score: float
    start_offset: int
    end_offset: int


class RagDocumentSearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=2000)
    user_id: str = Field(..., min_length=1)
    limit: int = Field(default=10, ge=1, le=50)
    mode: RagSearchMode = Field(default="hybrid")
    agent_mode: RagAgentMode = Field(default="normal")


class RagDocumentResultSchema(BaseModel):
    document_id: str
    score: float
    best_snippet: str
    citations: list[RagCitationSchema] = Field(default_factory=list)


class RagDocumentSearchResponse(BaseModel):
    query: str
    user_id: str
    count: int
    documents: list[RagDocumentResultSchema]
    processing_time_ms: float


class RagUserContextSchema(BaseModel):
    user_id: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    full_name: str | None = None
    email: str | None = None
    timezone: str | None = None
    locale: str | None = None
    current_date: str | None = None
    current_datetime_iso: str | None = None
    day_of_week: str | None = None


class RagChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=3000)
    user_id: str = Field(..., min_length=1)
    conversation_history: list[dict[str, str]] | None = None
    max_context_results: int = Field(default=15, ge=1, le=50)
    agent_mode: RagAgentMode = Field(default="normal")
    user_context: RagUserContextSchema | None = None


class RagQuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=3000)
    user_id: str = Field(..., min_length=1)
    conversation_history: list[dict[str, str]] | None = None
    max_context_results: int = Field(default=15, ge=1, le=50)
    agent_mode: RagAgentMode = Field(default="normal")
    user_context: RagUserContextSchema | None = None


class RagAnswerResponse(BaseModel):
    answer: str
    citations: list[RagCitationSchema] = Field(default_factory=list)
    processing_time_ms: float
    confidence: Literal["high", "medium", "low"]


class RagBackfillRequest(BaseModel):
    requested_by: str = Field(default="system")
    batch_size: int = Field(default=100, ge=1, le=1000)


class RagBackfillResponse(BaseModel):
    status: str
    details: str | None = None
