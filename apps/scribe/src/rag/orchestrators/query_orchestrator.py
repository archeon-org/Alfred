from __future__ import annotations

import asyncio
import statistics
from collections import defaultdict
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import TypeVar

from rag.agents import (
    AnswerAgent,
    ContextAssemblyAgent,
    HybridRetrieveAgent,
    QueryRewriteAgent,
    RerankAgent,
)
from rag.embedding_client import RagEmbeddingClient, get_rag_embedding_client
from rag.types import (
    DocumentSearchHit,
    RagAgentEvent,
    RagAgentMode,
    RagAnswer,
    RagCitation,
    RagSearchMode,
    RagUserContext,
    RetrievedChunk,
)

NO_CONTEXT_ANSWER = (
    "I could not find enough indexed evidence to answer this confidently. "
    "Try a more specific question or index more documents."
)
_T = TypeVar("_T")


class QueryOrchestrator:
    def __init__(self, embedding_client: RagEmbeddingClient | None = None) -> None:
        embedding_client = embedding_client or get_rag_embedding_client()
        self._rewrite_agent = QueryRewriteAgent()
        self._retrieve_agent = HybridRetrieveAgent(embedding_client=embedding_client)
        self._rerank_agent = RerankAgent()
        self._context_assembly_agent = ContextAssemblyAgent()
        self._answer_agent = AnswerAgent(embedding_client=embedding_client)

    async def document_search(
        self,
        *,
        user_id: str,
        query: str,
        limit: int,
        mode: RagSearchMode,
        agent_mode: RagAgentMode = "normal",
        on_event: Callable[[RagAgentEvent], Awaitable[None] | None] | None = None,
    ) -> tuple[str, list[DocumentSearchHit]]:
        await self._emit_event(
            on_event,
            stage="rewrite_query",
            message="Rewriting query for retrieval.",
            mode=agent_mode,
        )
        rewritten_query = self._rewrite_agent.rewrite(query=query)
        candidate_queries = self._build_candidate_queries(
            original_query=query,
            rewritten_query=rewritten_query,
            agent_mode=agent_mode,
        )
        retrieval_limit = self._resolve_retrieval_limit(limit=limit, agent_mode=agent_mode)

        all_retrieved: list[RetrievedChunk] = []
        for round_index, candidate_query in enumerate(candidate_queries, start=1):
            await self._emit_event(
                on_event,
                stage="retrieve_chunks",
                message=f"Retrieving evidence round {round_index}/{len(candidate_queries)}.",
                round=round_index,
                candidate_query=candidate_query,
                mode=mode,
            )
            current_query = candidate_query

            async def _retrieve_current_query(
                query_for_round: str = current_query,
            ) -> list[RetrievedChunk]:
                return await self._retrieve_agent.retrieve(
                    user_id=user_id,
                    query=query_for_round,
                    mode=mode,
                    limit=retrieval_limit,
                )

            retrieved = await self._with_retry_async(
                operation_name="retrieve_chunks",
                action=_retrieve_current_query,
            )
            all_retrieved.extend(retrieved)

        await self._emit_event(
            on_event,
            stage="rerank_results",
            message="Reranking and grouping document candidates.",
            chunk_count=len(all_retrieved),
        )
        reranked = self._rerank_agent.rerank(
            chunks=self._dedupe_chunks(all_retrieved),
            limit=max(limit * 4, 12),
        )
        hits = self._group_by_document(reranked, limit)
        await self._emit_event(
            on_event,
            stage="finalize",
            message=f"Retrieved {len(hits)} document candidates.",
            hit_count=len(hits),
        )
        return rewritten_query, hits

    async def answer(
        self,
        *,
        user_id: str,
        query: str,
        mode: RagSearchMode,
        max_context_results: int,
        agent_mode: RagAgentMode = "normal",
        conversation_history: list[dict[str, str]] | None = None,
        user_context: RagUserContext | None = None,
        on_event: Callable[[RagAgentEvent], Awaitable[None] | None] | None = None,
    ) -> RagAnswer:
        await self._emit_event(
            on_event,
            stage="rewrite_query",
            message="Rewriting user question.",
            mode=agent_mode,
        )
        rewritten_query = self._rewrite_agent.rewrite(
            query=query,
            conversation_history=conversation_history,
        )

        candidate_queries = self._build_candidate_queries(
            original_query=query,
            rewritten_query=rewritten_query,
            agent_mode=agent_mode,
        )
        retrieval_limit = self._resolve_retrieval_limit(
            limit=max_context_results,
            agent_mode=agent_mode,
        )

        all_retrieved: list[RetrievedChunk] = []
        for round_index, candidate_query in enumerate(candidate_queries, start=1):
            await self._emit_event(
                on_event,
                stage="retrieve_chunks",
                message=f"Searching evidence round {round_index}/{len(candidate_queries)}.",
                round=round_index,
                candidate_query=candidate_query,
                mode=mode,
            )
            current_query = candidate_query

            async def _retrieve_current_query(
                query_for_round: str = current_query,
            ) -> list[RetrievedChunk]:
                return await self._retrieve_agent.retrieve(
                    user_id=user_id,
                    query=query_for_round,
                    mode=mode,
                    limit=retrieval_limit,
                )

            retrieved = await self._with_retry_async(
                operation_name="retrieve_chunks",
                action=_retrieve_current_query,
            )
            all_retrieved.extend(retrieved)

        deduped_retrieved = self._dedupe_chunks(all_retrieved)
        await self._emit_event(
            on_event,
            stage="rerank_results",
            message="Reranking evidence chunks.",
            chunk_count=len(deduped_retrieved),
        )
        reranked = self._rerank_agent.rerank(
            chunks=deduped_retrieved,
            limit=max_context_results * (2 if agent_mode == "reasoning" else 1),
        )

        assembled = self._context_assembly_agent.assemble(
            chunks=reranked,
            max_tokens=3600 if agent_mode == "reasoning" else 2200,
        )
        await self._emit_event(
            on_event,
            stage="assemble_context",
            message="Assembled retrieval context for answer generation.",
            citation_count=len(assembled.citations),
        )

        if not assembled.citations:
            await self._emit_event(
                on_event,
                stage="finalize",
                message="No strong evidence found in indexed chunks.",
                citation_count=0,
            )
            return RagAnswer(
                answer=NO_CONTEXT_ANSWER,
                citations=[],
                confidence="low",
                processing_time_ms=0.0,
                rewritten_query=rewritten_query,
            )

        await self._emit_event(
            on_event,
            stage="generate_answer",
            message="Generating grounded answer from retrieved evidence.",
            citation_count=len(assembled.citations),
        )
        answer = await self._with_retry_async(
            operation_name="generate_answer",
            action=lambda: self._answer_agent.answer(
                user_id=user_id,
                query=rewritten_query,
                context=assembled.context,
                conversation_history=conversation_history,
                agent_mode=agent_mode,
                user_context=user_context,
            ),
        )

        confidence = self._derive_confidence(
            chunks=assembled.selected_chunks,
            citation_count=len(assembled.citations),
        )
        await self._emit_event(
            on_event,
            stage="finalize",
            message="Answer ready.",
            confidence=confidence,
            citation_count=len(assembled.citations),
        )

        return RagAnswer(
            answer=answer,
            citations=assembled.citations,
            confidence=confidence,
            processing_time_ms=0.0,
            rewritten_query=rewritten_query,
        )

    @staticmethod
    def _resolve_retrieval_limit(*, limit: int, agent_mode: RagAgentMode) -> int:
        if agent_mode == "reasoning":
            return max(limit * 2, 24)
        return max(limit, 12)

    def _build_candidate_queries(
        self,
        *,
        original_query: str,
        rewritten_query: str,
        agent_mode: RagAgentMode,
    ) -> list[str]:
        candidates: list[str] = [rewritten_query]
        if agent_mode == "reasoning":
            lowered = rewritten_query.lower()
            now = datetime.now(UTC)
            month_hint = now.strftime("%B %Y")
            temporal_terms = {"month", "week", "today", "yesterday", "tomorrow", "last", "next"}
            if any(term in lowered for term in temporal_terms):
                candidates.append(f"{rewritten_query} {month_hint}")
            if original_query.strip() and original_query.strip() != rewritten_query:
                candidates.append(original_query.strip())

            keyword_fallback = " ".join(term for term in lowered.split() if len(term) >= 4)
            if keyword_fallback and keyword_fallback != lowered:
                candidates.append(keyword_fallback)

        # Preserve order and uniqueness.
        unique_candidates: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            normalized = " ".join(candidate.split()).strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            unique_candidates.append(normalized)
        return unique_candidates

    @staticmethod
    def _dedupe_chunks(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        if not chunks:
            return []
        by_chunk: dict[str, RetrievedChunk] = {}
        for chunk in chunks:
            existing = by_chunk.get(chunk.chunk_id)
            if existing is None or chunk.merged_score > existing.merged_score:
                by_chunk[chunk.chunk_id] = chunk
        deduped = list(by_chunk.values())
        deduped.sort(key=lambda item: item.merged_score, reverse=True)
        return deduped

    async def _emit_event(
        self,
        on_event: Callable[[RagAgentEvent], Awaitable[None] | None] | None,
        *,
        stage: str,
        message: str,
        **metadata: object,
    ) -> None:
        if on_event is None:
            return
        result = on_event(
            RagAgentEvent(
                stage=stage,
                message=message,
                metadata={k: v for k, v in metadata.items() if v is not None},
            )
        )
        if asyncio.iscoroutine(result):
            await result

    async def _with_retry_async(
        self,
        *,
        operation_name: str,
        action: Callable[[], Awaitable[_T]],
        attempts: int = 3,
        base_delay_seconds: float = 0.25,
    ) -> _T:
        last_error: Exception | None = None
        for attempt in range(1, attempts + 1):
            try:
                return await action()
            except Exception as error:  # noqa: BLE001
                last_error = error
                if attempt == attempts or not self._is_retryable_error(error):
                    break
                await asyncio.sleep(base_delay_seconds * (2 ** (attempt - 1)))
        if last_error is None:
            raise RuntimeError(f"{operation_name} failed without explicit error")
        raise RuntimeError(f"{operation_name} failed: {last_error}") from last_error

    @staticmethod
    def _is_retryable_error(error: Exception) -> bool:
        retryable_tokens = {
            "timeout",
            "connection",
            "temporarily unavailable",
            "service unavailable",
            "too many requests",
            "rate",
            "429",
            "503",
        }
        error_text = str(error).lower()
        error_name = error.__class__.__name__.lower()
        return any(token in error_text or token in error_name for token in retryable_tokens)

    @staticmethod
    def _group_by_document(chunks: list[RetrievedChunk], limit: int) -> list[DocumentSearchHit]:
        grouped: dict[str, list[RetrievedChunk]] = defaultdict(list)
        for chunk in chunks:
            grouped[chunk.document_id].append(chunk)

        hits: list[DocumentSearchHit] = []
        for document_id, document_chunks in grouped.items():
            ordered = sorted(document_chunks, key=lambda item: item.merged_score, reverse=True)
            top_citations = ordered[:3]
            citations: list[RagCitation] = []
            for citation in top_citations:
                snippet = citation.content.strip()
                if len(snippet) > 260:
                    snippet = snippet[:257].rstrip() + "..."
                citations.append(
                    RagCitation(
                        chunk_id=citation.chunk_id,
                        document_id=citation.document_id,
                        snippet=snippet,
                        score=round(citation.merged_score, 4),
                        start_offset=citation.start_offset,
                        end_offset=citation.end_offset,
                    )
                )

            best = top_citations[0]
            best_snippet = best.content.strip()
            if len(best_snippet) > 300:
                best_snippet = best_snippet[:297].rstrip() + "..."

            hits.append(
                DocumentSearchHit(
                    document_id=document_id,
                    score=round(best.merged_score, 4),
                    best_snippet=best_snippet,
                    citations=citations,
                )
            )

        hits.sort(key=lambda item: item.score, reverse=True)
        return hits[:limit]

    @staticmethod
    def _derive_confidence(*, chunks: list[RetrievedChunk], citation_count: int) -> str:
        if not chunks or citation_count == 0:
            return "low"

        scores = [chunk.merged_score for chunk in chunks[: min(len(chunks), 8)]]
        avg_score = statistics.fmean(scores)
        spread = max(scores) - min(scores) if len(scores) > 1 else 0.0

        if avg_score >= 0.72 and citation_count >= 3 and spread <= 0.45:
            return "high"
        if avg_score >= 0.45 and citation_count >= 1:
            return "medium"
        return "low"
