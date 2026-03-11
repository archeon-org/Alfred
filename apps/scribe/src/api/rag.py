from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Literal, cast

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from api.auth import verify_internal_service
from api.schemas.rag import (
    RagAnswerResponse,
    RagBackfillRequest,
    RagBackfillResponse,
    RagChatRequest,
    RagCitationSchema,
    RagDocumentResultSchema,
    RagDocumentSearchRequest,
    RagDocumentSearchResponse,
    RagQuestionRequest,
    RagUserContextSchema,
)
from application.api.rag_service import get_rag_service
from rag.types import RagCitation, RagUserContext

router = APIRouter(prefix="/rag", tags=["RAG"])


def _serialize_citation(citation: RagCitation) -> RagCitationSchema:
    return RagCitationSchema(
        chunk_id=citation.chunk_id,
        document_id=citation.document_id,
        snippet=citation.snippet,
        score=citation.score,
        start_offset=citation.start_offset,
        end_offset=citation.end_offset,
    )


def _serialize_stream_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("type") != "result":
        return payload

    citations = payload.get("citations", [])
    serialized_citations: list[dict[str, Any]] = []
    for citation in citations if isinstance(citations, list) else []:
        if isinstance(citation, RagCitation):
            serialized_citations.append(_serialize_citation(citation).model_dump())

    return {
        **payload,
        "citations": serialized_citations,
    }


def _resolve_user_context(payload: RagUserContextSchema | None) -> RagUserContext | None:
    if payload is None:
        return None
    return cast(RagUserContext, payload.model_dump(exclude_none=True))


@router.post(
    "/search/documents",
    response_model=RagDocumentSearchResponse,
    summary="Chunk-based document search",
)
async def search_documents(
    request: RagDocumentSearchRequest,
    _: None = Depends(verify_internal_service),
) -> RagDocumentSearchResponse:
    result = await get_rag_service().execute_document_search(
        user_id=request.user_id,
        query=request.query,
        limit=request.limit,
        mode=request.mode,
        agent_mode=request.agent_mode,
    )
    return RagDocumentSearchResponse(
        query=result.query,
        user_id=result.user_id,
        count=len(result.documents),
        documents=[
            RagDocumentResultSchema(
                document_id=hit.document_id,
                score=hit.score,
                best_snippet=hit.best_snippet,
                citations=[_serialize_citation(citation) for citation in hit.citations],
            )
            for hit in result.documents
        ],
        processing_time_ms=result.processing_time_ms,
    )


@router.post(
    "/chat",
    response_model=RagAnswerResponse,
    summary="Chat answer with chunk citations",
)
async def chat(
    request: RagChatRequest,
    _: None = Depends(verify_internal_service),
) -> RagAnswerResponse:
    result = await get_rag_service().execute_answer(
        user_id=request.user_id,
        query=request.message,
        mode="hybrid",
        max_context_results=request.max_context_results,
        agent_mode=request.agent_mode,
        conversation_history=request.conversation_history,
        user_context=_resolve_user_context(request.user_context),
    )
    confidence = cast(Literal["high", "medium", "low"], result.confidence)
    return RagAnswerResponse(
        answer=result.answer,
        citations=[_serialize_citation(citation) for citation in result.citations],
        processing_time_ms=result.processing_time_ms,
        confidence=confidence,
    )


@router.post(
    "/question",
    response_model=RagAnswerResponse,
    summary="Question answering with chunk citations",
)
async def question(
    request: RagQuestionRequest,
    _: None = Depends(verify_internal_service),
) -> RagAnswerResponse:
    result = await get_rag_service().execute_answer(
        user_id=request.user_id,
        query=request.question,
        mode="hybrid",
        max_context_results=request.max_context_results,
        agent_mode=request.agent_mode,
        conversation_history=request.conversation_history,
        user_context=_resolve_user_context(request.user_context),
    )
    confidence = cast(Literal["high", "medium", "low"], result.confidence)
    return RagAnswerResponse(
        answer=result.answer,
        citations=[_serialize_citation(citation) for citation in result.citations],
        processing_time_ms=result.processing_time_ms,
        confidence=confidence,
    )


@router.post(
    "/chat/stream",
    summary="Stream chat answer with retrieval progress",
)
async def chat_stream(
    request: RagChatRequest,
    _: None = Depends(verify_internal_service),
) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        async for payload in get_rag_service().stream_answer(
            user_id=request.user_id,
            query=request.message,
            mode="hybrid",
            max_context_results=request.max_context_results,
            agent_mode=request.agent_mode,
            conversation_history=request.conversation_history,
            user_context=_resolve_user_context(request.user_context),
        ):
            serialized = _serialize_stream_payload(payload)
            yield json.dumps(serialized) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post(
    "/question/stream",
    summary="Stream question answer with retrieval progress",
)
async def question_stream(
    request: RagQuestionRequest,
    _: None = Depends(verify_internal_service),
) -> StreamingResponse:
    async def event_generator() -> AsyncIterator[str]:
        async for payload in get_rag_service().stream_answer(
            user_id=request.user_id,
            query=request.question,
            mode="hybrid",
            max_context_results=request.max_context_results,
            agent_mode=request.agent_mode,
            conversation_history=request.conversation_history,
            user_context=_resolve_user_context(request.user_context),
        ):
            serialized = _serialize_stream_payload(payload)
            yield json.dumps(serialized) + "\n"

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")


@router.post(
    "/backfill",
    response_model=RagBackfillResponse,
    summary="Trigger async document backfill indexing",
)
async def backfill(
    request: RagBackfillRequest,
    _: None = Depends(verify_internal_service),
) -> RagBackfillResponse:
    from tasks.rag import backfill_documents

    async_result = backfill_documents.delay(
        {
            "requestedBy": request.requested_by,
            "batchSize": request.batch_size,
        }
    )
    return RagBackfillResponse(
        status="queued",
        details=f"task_id={async_result.id}",
    )
