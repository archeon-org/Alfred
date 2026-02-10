"""
Question API

Endpoint for asking questions to the user's Second Brain.
Uses Graphiti knowledge graph for context retrieval and LLM for answer generation.
"""

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import verify_internal_service
from core.logging import get_logger
from graphrag import retrieve_context_for_query, get_graphiti_client
from graphrag.config import get_graphiti_settings

logger = get_logger(__name__)
router = APIRouter(prefix="/question", tags=["Question"])


# =============================================================================
# Request/Response Models
# =============================================================================


class QuestionRequest(BaseModel):
    """Request body for asking a question to your Second Brain."""

    question: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="The question to ask your second brain",
        example="What invoices do I have pending?",
    )
    user_id: str = Field(..., min_length=1, description="User ID for scoped search")
    conversation_history: Optional[list[dict]] = Field(
        default=None,
        description="Optional conversation history for multi-turn context",
        example=[
            {"role": "user", "content": "What documents do I have?"},
            {"role": "assistant", "content": "You have 15 documents..."},
        ],
    )
    max_context_results: int = Field(
        default=15, ge=1, le=50, description="Maximum knowledge graph results to use for context"
    )


class QuestionResponse(BaseModel):
    """Response containing the AI-generated answer from your Second Brain."""

    answer: str = Field(
        ...,
        description="The AI-generated answer based on your documents",
        example="You have 3 pending invoices: one from Acme Corp for $500, one from...",
    )
    context_used: str = Field(
        ..., description="The knowledge graph context used to generate the answer"
    )
    sources: list[str] = Field(
        default_factory=list,
        description="Source entities and documents referenced",
        example=["Invoice-001", "Invoice-002", "Acme Corp"],
    )
    processing_time_ms: float = Field(..., description="Total processing time in milliseconds")
    confidence: str = Field(
        default="medium",
        description="Confidence level based on context quality: high, medium, low",
        example="high",
    )


# =============================================================================
# Question Endpoint
# =============================================================================


@router.post(
    "/",
    response_model=QuestionResponse,
    summary="Ask your Second Brain",
    description="""
Ask a question to your Second Brain and get an AI-generated answer based on your documents.

**How it works**:
1. Retrieves relevant context from your knowledge graph (documents, entities, facts)
2. Uses an LLM to generate an answer based on that context
3. Returns the answer with the context and sources used

**Example questions**:
- "What invoices do I have pending?"
- "Summarize my contracts with Acme Corp"
- "When does my insurance expire?"
- "What were the key points in my last meeting notes?"
    """,
    responses={
        200: {"description": "AI-generated answer with sources"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Failed to generate answer"},
    },
)
async def ask_question(
    request: QuestionRequest,
    _: None = Depends(verify_internal_service),
) -> QuestionResponse:
    """
    Ask a question to your Second Brain.

    This endpoint:
    1. Retrieves relevant context from your knowledge graph (documents, entities, facts)
    2. Uses an LLM to generate an answer based on that context
    3. Returns the answer with the context and sources used

    **Authentication**: Requires internal service API key.

    **Example questions**:
    - "What invoices do I have pending?"
    - "Summarize my contracts with Acme Corp"
    - "When does my insurance expire?"
    - "What were the key points in my last meeting notes?"
    """
    start_time = time.time()

    logger.info(f"Question from user {request.user_id}: {request.question[:100]}...")

    try:
        # Step 1: Retrieve context from knowledge graph
        context = await retrieve_context_for_query(
            user_id=request.user_id,
            query=request.question,
            num_results=request.max_context_results,
            include_communities=True,
        )

        # Check if we have meaningful context
        has_context = context and "No relevant information found" not in context

        if not has_context:
            # No relevant documents - provide helpful response
            processing_time = (time.time() - start_time) * 1000
            return QuestionResponse(
                answer=(
                    "I couldn't find relevant information in your documents to answer this question. "
                    "This might be because:\n"
                    "- The relevant documents haven't been uploaded yet\n"
                    "- The information is described differently in your documents\n"
                    "- The documents are still being processed\n\n"
                    "Try rephrasing your question or uploading relevant documents."
                ),
                context_used="No relevant context found",
                sources=[],
                processing_time_ms=round(processing_time, 2),
                confidence="low",
            )

        # Step 2: Generate answer using LLM
        answer, sources, confidence = await _generate_answer(
            question=request.question,
            context=context,
            conversation_history=request.conversation_history,
        )

        processing_time = (time.time() - start_time) * 1000

        logger.info(f"Question answered in {processing_time:.1f}ms, confidence={confidence}")

        return QuestionResponse(
            answer=answer,
            context_used=context,
            sources=sources,
            processing_time_ms=round(processing_time, 2),
            confidence=confidence,
        )

    except Exception as e:
        logger.error(f"Question failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to answer question: {str(e)}")


async def _generate_answer(
    question: str,
    context: str,
    conversation_history: Optional[list[dict]] = None,
) -> tuple[str, list[str], str]:
    """
    Generate an answer using LLM with the retrieved context.

    Returns:
        tuple of (answer, sources, confidence)
    """
    import openai

    settings = get_graphiti_settings()

    # Configure OpenAI client (works with Fireworks AI too)
    client = openai.AsyncOpenAI(
        api_key=settings.openai.api_key.get_secret_value(),
        base_url=settings.openai.base_url,
    )

    # Build system prompt
    system_prompt = """You are the user's personal assistant with complete access to their documents, contracts, notes, and knowledge base.

YOUR PERSONALITY:
- Speak with confidence and authority - you know their documents inside out
- Be direct and helpful, like a trusted executive assistant
- Never say "based on the context" or "from what I can see" - just answer naturally
- Don't hedge with phrases like "it appears" or "it seems" - be definitive
- If information exists in their documents, state it as fact
- Only express uncertainty if the documents genuinely don't contain the information

STYLE GUIDELINES:
1. Answer as if you personally organized and know all their files
2. Be concise and actionable - get straight to the point
3. When referencing documents, mention them naturally (e.g., "Your contract with ABC Corp shows...")
4. Use a warm but professional tone
5. If asked about something not in their documents, simply say "I don't have that in your documents" without over-explaining

CONTEXT FROM USER'S DOCUMENTS:
---
{context}
---

Now answer their question directly and confidently."""

    # Build messages
    messages = [{"role": "system", "content": system_prompt.format(context=context)}]

    # Add conversation history if provided
    if conversation_history:
        for msg in conversation_history[-6:]:  # Keep last 6 messages for context
            if msg.get("role") in ["user", "assistant"]:
                messages.append({"role": msg["role"], "content": msg["content"]})

    # Add current question
    messages.append({"role": "user", "content": question})

    try:
        response = await client.chat.completions.create(
            model=settings.openai.model,
            messages=messages,
            max_tokens=2048,
            temperature=0.3,  # Lower temperature for more focused answers
        )

        answer = response.choices[0].message.content or "I couldn't generate an answer."

        # Extract sources from context (entity names between **)
        import re

        sources = re.findall(r"\*\*([^*]+)\*\*", context)
        sources = list(set(sources))[:10]  # Dedupe and limit

        # Determine confidence based on context quality
        context_lines = context.count("\n")
        fact_count = context.count("1.") + context.count("2.") + context.count("3.")

        if fact_count >= 5 or context_lines >= 10:
            confidence = "high"
        elif fact_count >= 2 or context_lines >= 5:
            confidence = "medium"
        else:
            confidence = "low"

        return answer, sources, confidence

    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise


@router.post(
    "/quick",
    summary="Quick answer (minimal response)",
    description="Quick answer endpoint that returns just the answer string. Same as /question but with minimal response format for simple integrations.",
    responses={
        200: {
            "description": "Quick answer response",
            "content": {
                "application/json": {
                    "example": {
                        "answer": "Your insurance expires on December 31st, 2024.",
                        "confidence": "high",
                    }
                }
            },
        },
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Failed to generate answer"},
    },
)
async def quick_answer(
    request: QuestionRequest,
    _: None = Depends(verify_internal_service),
) -> dict:
    """
    Quick answer endpoint - returns just the answer string for simple integrations.

    Same as /question but with minimal response format.
    """
    result = await ask_question(request, _)
    return {
        "answer": result.answer,
        "confidence": result.confidence,
    }
