from typing import Any

from pydantic import BaseModel, Field


class QuestionRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="The question to ask your second brain",
        examples=["What invoices do I have pending?"],
    )
    user_id: str = Field(..., min_length=1, description="User ID for scoped search")
    conversation_history: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional conversation history for multi-turn context",
        examples=[
            [
                {"role": "user", "content": "What documents do I have?"},
                {"role": "assistant", "content": "You have 15 documents..."},
            ]
        ],
    )
    max_context_results: int = Field(
        default=15,
        ge=1,
        le=50,
        description="Maximum knowledge graph results to use for context",
    )


class QuestionResponse(BaseModel):
    answer: str = Field(
        ...,
        description="The AI-generated answer based on your documents",
        examples=["You have 3 pending invoices: one from Acme Corp for $500, one from..."],
    )
    context_used: str = Field(
        ...,
        description="The knowledge graph context used to generate the answer",
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Source entities and documents referenced",
        examples=[["Invoice-001", "Invoice-002", "Acme Corp"]],
    )
    processing_time_ms: float = Field(..., description="Total processing time in milliseconds")
    confidence: str = Field(
        default="medium",
        description="Confidence level based on context quality: high, medium, low",
        examples=["high"],
    )
