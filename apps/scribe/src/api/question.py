from fastapi import APIRouter, Depends

from api.auth import verify_internal_service
from api.presenters.question import present_question, present_quick_answer
from api.schemas.question import QuestionRequest, QuestionResponse
from application.api.question_service import get_question_service

router = APIRouter(prefix="/question", tags=["Question"])


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
    result = await get_question_service().execute_question(
        user_id=request.user_id,
        question=request.question,
        max_context_results=request.max_context_results,
        conversation_history=request.conversation_history,
    )
    return present_question(result)


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
) -> dict[str, str]:
    result = await get_question_service().execute_question(
        user_id=request.user_id,
        question=request.question,
        max_context_results=request.max_context_results,
        conversation_history=request.conversation_history,
    )
    return present_quick_answer(result)
