from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from application.api.errors import ApiServiceError
from core.logging import get_logger
from rag.orchestrators import QueryOrchestrator
from rag.types import (
    DocumentSearchHit,
    RagAgentEvent,
    RagAgentMode,
    RagAnswer,
    RagSearchMode,
    RagUserContext,
)

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class RagDocumentSearchResult:
    query: str
    rewritten_query: str
    user_id: str
    documents: list[DocumentSearchHit]
    processing_time_ms: float


class RagService:
    def __init__(self) -> None:
        self._query_orchestrator = QueryOrchestrator()

    async def execute_document_search(
        self,
        *,
        user_id: str,
        query: str,
        limit: int,
        mode: RagSearchMode,
        agent_mode: RagAgentMode = "normal",
    ) -> RagDocumentSearchResult:
        started_at = time.perf_counter()
        try:
            rewritten_query, documents = await self._query_orchestrator.document_search(
                user_id=user_id,
                query=query,
                limit=limit,
                mode=mode,
                agent_mode=agent_mode,
            )
        except Exception as error:
            logger.error("RAG document search failed", error=str(error), exc_info=True)
            raise ApiServiceError(f"RAG document search failed: {error}") from error

        return RagDocumentSearchResult(
            query=query,
            rewritten_query=rewritten_query,
            user_id=user_id,
            documents=documents,
            processing_time_ms=round((time.perf_counter() - started_at) * 1000, 2),
        )

    async def execute_answer(
        self,
        *,
        user_id: str,
        query: str,
        mode: RagSearchMode,
        max_context_results: int,
        agent_mode: RagAgentMode = "normal",
        conversation_history: list[dict[str, str]] | None = None,
        user_context: RagUserContext | None = None,
    ) -> RagAnswer:
        started_at = time.perf_counter()
        try:
            response = await self._query_orchestrator.answer(
                user_id=user_id,
                query=query,
                mode=mode,
                max_context_results=max_context_results,
                agent_mode=agent_mode,
                conversation_history=conversation_history,
                user_context=user_context,
            )
        except Exception as error:
            logger.error("RAG answer failed", error=str(error), exc_info=True)
            raise ApiServiceError(f"RAG answer failed: {error}") from error

        return RagAnswer(
            answer=response.answer,
            citations=response.citations,
            confidence=response.confidence,
            processing_time_ms=round((time.perf_counter() - started_at) * 1000, 2),
            rewritten_query=response.rewritten_query,
        )

    async def stream_answer(
        self,
        *,
        user_id: str,
        query: str,
        mode: RagSearchMode,
        max_context_results: int,
        agent_mode: RagAgentMode = "normal",
        conversation_history: list[dict[str, str]] | None = None,
        user_context: RagUserContext | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        started_at = time.perf_counter()
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        async def _on_event(event: RagAgentEvent) -> None:
            await queue.put(
                {
                    "type": "event",
                    "stage": event.stage,
                    "message": event.message,
                    "metadata": event.metadata,
                }
            )

        async def _run() -> None:
            try:
                response = await self._query_orchestrator.answer(
                    user_id=user_id,
                    query=query,
                    mode=mode,
                    max_context_results=max_context_results,
                    agent_mode=agent_mode,
                    conversation_history=conversation_history,
                    user_context=user_context,
                    on_event=_on_event,
                )
                for delta in self._chunk_answer_for_stream(response.answer):
                    await queue.put({"type": "answer_delta", "delta": delta})
                await queue.put(
                    {
                        "type": "result",
                        "answer": response.answer,
                        "citations": response.citations,
                        "confidence": response.confidence,
                        "rewritten_query": response.rewritten_query,
                        "processing_time_ms": round((time.perf_counter() - started_at) * 1000, 2),
                    }
                )
            except Exception as error:
                logger.error("RAG stream answer failed", error=str(error), exc_info=True)
                await queue.put(
                    {
                        "type": "error",
                        "message": f"RAG answer failed: {error}",
                    }
                )
            finally:
                await queue.put(None)

        task = asyncio.create_task(_run())
        try:
            while True:
                payload = await queue.get()
                if payload is None:
                    break
                yield payload
        finally:
            if not task.done():
                task.cancel()

    @staticmethod
    def _chunk_answer_for_stream(answer: str, chunk_size: int = 96) -> list[str]:
        if not answer:
            return []
        return [answer[index : index + chunk_size] for index in range(0, len(answer), chunk_size)]


_rag_service: RagService | None = None


def get_rag_service() -> RagService:
    global _rag_service
    if _rag_service is None:
        _rag_service = RagService()
    return _rag_service
