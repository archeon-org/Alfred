from api.schemas.question import QuestionResponse
from application.api.question_service import QuestionAnswer


def present_question(result: QuestionAnswer) -> QuestionResponse:
    return QuestionResponse(
        answer=result.answer,
        context_used=result.context_used,
        sources=result.sources,
        processing_time_ms=result.processing_time_ms,
        confidence=result.confidence,
    )


def present_quick_answer(result: QuestionAnswer) -> dict[str, str]:
    return {"answer": result.answer, "confidence": result.confidence}
