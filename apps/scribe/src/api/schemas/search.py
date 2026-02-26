from datetime import datetime

from pydantic import BaseModel, Field

from application.api.search_service import SearchMode


class DocumentResult(BaseModel):
    document_id: str | None = Field(None, description="Document UUID from storage")
    filename: str = Field(..., description="Original filename")
    relevance: float = Field(..., ge=0, le=1, description="Relevance score (0-1)")
    matched_entities: list[str] = Field(
        default_factory=list,
        description="Entities that matched the query",
    )
    reference_time: str | None = Field(None, description="Document reference time if available")


class DocumentSearchResponse(BaseModel):
    query: str = Field(..., description="Original search query")
    user_id: str = Field(..., description="User ID for scoped search")
    count: int = Field(..., ge=0, description="Number of results returned")
    documents: list[DocumentResult] = Field(default_factory=list, description="Matching documents")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class EntityResult(BaseModel):
    uuid: str = Field(..., description="Unique entity identifier")
    name: str = Field(..., description="Entity name", examples=["John Doe"])
    summary: str | None = Field(None, description="AI-generated entity summary")
    labels: list[str] = Field(
        default_factory=list,
        description="Entity type labels",
        examples=[["Person", "Employee"]],
    )


class FactResult(BaseModel):
    uuid: str = Field(..., description="Unique fact identifier")
    fact: str = Field(
        ...,
        description="The factual statement",
        examples=["John Doe works at Acme Corp"],
    )
    source_uuid: str | None = Field(None, description="Source entity UUID")
    target_uuid: str | None = Field(None, description="Target entity UUID")
    created_at: datetime | None = Field(None, description="When the fact was extracted")


class CommunityResult(BaseModel):
    name: str = Field(..., description="Community name", examples=["Work Colleagues"])
    summary: str | None = Field(None, description="AI-generated community summary")


class SearchRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=2,
        max_length=1000,
        description="Search query text",
        examples=["invoices from last month"],
    )
    user_id: str = Field(..., min_length=1, description="User ID for scoped search")
    mode: SearchMode = Field(
        default=SearchMode.hybrid,
        description="Search strategy: hybrid, semantic, keyword, or graph",
    )
    limit: int = Field(default=10, ge=1, le=50, description="Maximum number of results")
    include_communities: bool = Field(
        default=False,
        description="Include community summaries in results",
    )


class SearchResponse(BaseModel):
    query: str = Field(..., description="Original search query")
    mode: str = Field(..., description="Search mode used")
    user_id: str = Field(..., description="User ID")
    count: int = Field(..., ge=0, description="Total result count")
    entities: list[EntityResult] = Field(default_factory=list, description="Matched entities")
    facts: list[FactResult] = Field(
        default_factory=list,
        description="Relevant facts/relationships",
    )
    communities: list[CommunityResult] = Field(
        default_factory=list,
        description="Related communities",
    )
    context: str | None = Field(None, description="Formatted context string for LLM consumption")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class ChatSearchRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="User message/question",
        examples=["What documents do I have about my car?"],
    )
    user_id: str = Field(..., min_length=1, description="User ID")
    conversation_context: str | None = Field(
        None,
        description="Previous conversation context for continuity",
    )
    limit: int = Field(default=10, ge=1, le=50, description="Maximum results to include")


class ChatSearchResponse(BaseModel):
    query: str = Field(..., description="Original query/message")
    context: str = Field(..., description="Formatted context for LLM system prompt")
    entity_count: int = Field(..., ge=0, description="Number of entities in context")
    fact_count: int = Field(..., ge=0, description="Number of facts in context")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")
