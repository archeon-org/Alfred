from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from rag.agents.context_assembly_agent import AssembledContext
from rag.orchestrators import ingestion_orchestrator as ingestion_module
from rag.orchestrators import query_orchestrator as query_module
from rag.repositories import chunk_repository as chunk_repo_module
from rag.repositories.chunk_repository import ChunkRepository
from rag.types import ChunkCandidate, ChunkForIndexing, RagCitation, RetrievedChunk


def _chunk(
    chunk_id: str,
    document_id: str,
    score: float,
    *,
    content: str | None = None,
    title: str | None = "Doc",
    original_name: str | None = None,
) -> RetrievedChunk:
    chunk = RetrievedChunk(
        chunk_id=chunk_id,
        document_id=document_id,
        content=content or f"content {chunk_id}",
        score=score,
        start_offset=0,
        end_offset=20,
        title=title,
        original_name=original_name,
    )
    chunk.merged_score = score
    return chunk


@pytest.mark.asyncio
async def test_ingestion_orchestrator_run_success(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, object] = {}

    class FakeRepository:
        def __init__(self, session) -> None:
            calls["session"] = session

        def get_document_content(self, document_id: str, user_id: str):
            calls["lookup"] = (document_id, user_id)
            return ("Raw content", "Title A", "file.pdf")

    class FakeContentAgent:
        def prepare(self, *, content: str, title: str | None, original_name: str | None):
            return SimpleNamespace(
                text=f"clean::{content}", title=title, original_name=original_name
            )

    class FakeChunkingAgent:
        def chunk(
            self, *, content: str, document_name: str, document_id: str
        ) -> list[ChunkCandidate]:
            calls["chunk_input"] = (content, document_name, document_id)
            return [
                ChunkCandidate(
                    chunk_index=0,
                    content="chunk-1",
                    token_count=2,
                    start_offset=0,
                    end_offset=7,
                    content_hash="h1",
                )
            ]

    class FakeEmbeddingAgent:
        async def embed_chunks(
            self, *, user_id: str, chunks: list[ChunkCandidate]
        ) -> list[ChunkForIndexing]:
            calls["embed_input"] = (user_id, len(chunks))
            return [
                ChunkForIndexing(
                    chunk_index=0,
                    content="chunk-1",
                    token_count=2,
                    start_offset=0,
                    end_offset=7,
                    content_hash="h1",
                    embedding=[0.1, 0.2],
                    model="embed-model",
                )
            ]

    class FakeStorageAgent:
        def store_chunks(
            self, *, repository, document_id: str, user_id: str, chunks: list[ChunkForIndexing]
        ):
            calls["store_input"] = (repository is not None, document_id, user_id, len(chunks))
            return {"upserted": 1, "skipped": 0, "deleted": 0}

    class FakeQualityAgent:
        def assess(self, *, chunks, upserted: int, skipped: int, deleted: int):
            calls["quality_input"] = (len(chunks), upserted, skipped, deleted)
            return {
                "status": True,
                "total_chunks": 1,
                "upserted": upserted,
                "skipped": skipped,
                "deleted": deleted,
                "zero_indexed": False,
                "low_coverage": False,
            }

    monkeypatch.setattr(ingestion_module, "ChunkRepository", FakeRepository)
    monkeypatch.setattr(ingestion_module, "ContentPreparationAgent", lambda: FakeContentAgent())
    monkeypatch.setattr(ingestion_module, "ChunkingAgent", lambda: FakeChunkingAgent())
    monkeypatch.setattr(
        ingestion_module, "EmbeddingAgent", lambda embedding_client: FakeEmbeddingAgent()
    )
    monkeypatch.setattr(ingestion_module, "StorageAgent", lambda: FakeStorageAgent())
    monkeypatch.setattr(ingestion_module, "QualityAgent", lambda: FakeQualityAgent())

    orchestrator = ingestion_module.IngestionOrchestrator(embedding_client=object())
    result = await orchestrator.run(
        session=object(),
        document_id="doc-1",
        user_id="user-1",
    )

    assert calls["lookup"] == ("doc-1", "user-1")
    assert calls["embed_input"] == ("user-1", 1)
    assert result["document_id"] == "doc-1"
    assert result["user_id"] == "user-1"
    assert result["title"] == "Title A"
    assert result["upserted"] == 1
    assert result["status"] is True


@pytest.mark.asyncio
async def test_ingestion_orchestrator_raises_when_document_content_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRepository:
        def __init__(self, session) -> None:  # noqa: ARG002
            return None

        def get_document_content(self, document_id: str, user_id: str):  # noqa: ARG002
            return None

    monkeypatch.setattr(ingestion_module, "ChunkRepository", FakeRepository)
    monkeypatch.setattr(
        ingestion_module,
        "EmbeddingAgent",
        lambda embedding_client: SimpleNamespace(embed_chunks=lambda **kwargs: []),
    )
    orchestrator = ingestion_module.IngestionOrchestrator(embedding_client=object())

    with pytest.raises(ValueError, match="missing content"):
        await orchestrator.run(session=object(), document_id="doc-1", user_id="user-1")


@pytest.mark.asyncio
async def test_query_orchestrator_document_search_groups_and_truncates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    long_content = "A" * 400
    retrieved = [
        _chunk("c1", "d1", 0.92, content=long_content, title="Invoice 2025"),
        _chunk("c2", "d1", 0.88, content="supporting chunk", title="Invoice 2025"),
        _chunk("c3", "d2", 0.60, content="other chunk", title="Contract"),
    ]

    class FakeRewriteAgent:
        def rewrite(self, *, query: str, conversation_history=None) -> str:  # noqa: ARG002
            return f"{query} rewritten"

    class FakeRetrieveAgent:
        async def retrieve(self, *, user_id: str, query: str, mode: str, limit: int):  # noqa: ARG002
            return retrieved

    class FakeRerankAgent:
        def rerank(self, *, chunks: list[RetrievedChunk], limit: int):  # noqa: ARG002
            return chunks

    monkeypatch.setattr(query_module, "QueryRewriteAgent", lambda: FakeRewriteAgent())
    monkeypatch.setattr(
        query_module, "HybridRetrieveAgent", lambda embedding_client: FakeRetrieveAgent()
    )
    monkeypatch.setattr(query_module, "RerankAgent", lambda: FakeRerankAgent())

    orchestrator = query_module.QueryOrchestrator(embedding_client=object())
    rewritten, hits = await orchestrator.document_search(
        user_id="user-1",
        query="invoice",
        limit=2,
        mode="hybrid",
    )

    assert rewritten == "invoice rewritten"
    assert len(hits) == 2
    assert hits[0].document_id == "d1"
    assert hits[0].best_snippet.endswith("...")
    assert len(hits[0].best_snippet) <= 300
    assert len(hits[0].citations) <= 3


@pytest.mark.asyncio
async def test_query_orchestrator_answer_returns_no_context_when_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRewriteAgent:
        def rewrite(self, *, query: str, conversation_history=None) -> str:  # noqa: ARG002
            return "rewritten"

    class FakeRetrieveAgent:
        async def retrieve(self, *, user_id: str, query: str, mode: str, limit: int):  # noqa: ARG002
            return []

    class FakeRerankAgent:
        def rerank(self, *, chunks: list[RetrievedChunk], limit: int):  # noqa: ARG002
            return []

    class FakeContextAgent:
        def assemble(self, *, chunks: list[RetrievedChunk], max_tokens: int):  # noqa: ARG002
            return AssembledContext(
                context="No context",
                citations=[],
                selected_chunks=[],
            )

    class FakeAnswerAgent:
        async def answer(self, **kwargs):  # noqa: ANN003, ARG002
            raise AssertionError("answer() should not run when no citations are available")

    monkeypatch.setattr(query_module, "QueryRewriteAgent", lambda: FakeRewriteAgent())
    monkeypatch.setattr(
        query_module, "HybridRetrieveAgent", lambda embedding_client: FakeRetrieveAgent()
    )
    monkeypatch.setattr(query_module, "RerankAgent", lambda: FakeRerankAgent())
    monkeypatch.setattr(query_module, "ContextAssemblyAgent", lambda: FakeContextAgent())
    monkeypatch.setattr(query_module, "AnswerAgent", lambda embedding_client: FakeAnswerAgent())

    orchestrator = query_module.QueryOrchestrator(embedding_client=object())
    answer = await orchestrator.answer(
        user_id="user-1",
        query="question",
        mode="hybrid",
        max_context_results=4,
    )

    assert answer.answer == query_module.NO_CONTEXT_ANSWER
    assert answer.citations == []
    assert answer.confidence == "low"
    assert answer.rewritten_query == "rewritten"


@pytest.mark.asyncio
async def test_query_orchestrator_answer_with_citations_calls_answer_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    selected_chunks = [
        _chunk("c1", "d1", 0.75, content="evidence one"),
        _chunk("c2", "d1", 0.78, content="evidence two"),
        _chunk("c3", "d2", 0.80, content="evidence three"),
    ]
    citations = [
        RagCitation(
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            snippet=chunk.content,
            score=chunk.merged_score,
            start_offset=chunk.start_offset,
            end_offset=chunk.end_offset,
        )
        for chunk in selected_chunks
    ]

    class FakeRewriteAgent:
        def rewrite(self, *, query: str, conversation_history=None) -> str:  # noqa: ARG002
            return "rewritten"

    class FakeRetrieveAgent:
        async def retrieve(self, *, user_id: str, query: str, mode: str, limit: int):  # noqa: ARG002
            return selected_chunks

    class FakeRerankAgent:
        def rerank(self, *, chunks: list[RetrievedChunk], limit: int):  # noqa: ARG002
            return chunks

    class FakeContextAgent:
        def assemble(self, *, chunks: list[RetrievedChunk], max_tokens: int):  # noqa: ARG002
            return AssembledContext(
                context="assembled context",
                citations=citations,
                selected_chunks=selected_chunks,
            )

    class FakeAnswerAgent:
        async def answer(
            self,
            *,
            user_id: str,
            query: str,
            context: str,
            conversation_history,
            agent_mode: str = "normal",
            user_context=None,
        ):  # noqa: ARG002
            return "final answer"

    monkeypatch.setattr(query_module, "QueryRewriteAgent", lambda: FakeRewriteAgent())
    monkeypatch.setattr(
        query_module, "HybridRetrieveAgent", lambda embedding_client: FakeRetrieveAgent()
    )
    monkeypatch.setattr(query_module, "RerankAgent", lambda: FakeRerankAgent())
    monkeypatch.setattr(query_module, "ContextAssemblyAgent", lambda: FakeContextAgent())
    monkeypatch.setattr(query_module, "AnswerAgent", lambda embedding_client: FakeAnswerAgent())

    orchestrator = query_module.QueryOrchestrator(embedding_client=object())
    answer = await orchestrator.answer(
        user_id="user-1",
        query="question",
        mode="hybrid",
        max_context_results=3,
        conversation_history=[{"role": "user", "content": "previous"}],
    )

    assert answer.answer == "final answer"
    assert len(answer.citations) == 3
    assert answer.confidence == "high"
    assert answer.rewritten_query == "rewritten"


def test_query_orchestrator_derive_confidence_branches() -> None:
    assert query_module.QueryOrchestrator._derive_confidence(chunks=[], citation_count=0) == "low"
    assert (
        query_module.QueryOrchestrator._derive_confidence(
            chunks=[_chunk("c1", "d1", 0.52)],
            citation_count=1,
        )
        == "medium"
    )
    assert (
        query_module.QueryOrchestrator._derive_confidence(
            chunks=[_chunk("c1", "d1", 0.2), _chunk("c2", "d1", 0.25)],
            citation_count=2,
        )
        == "low"
    )


def test_chunk_repository_upsert_counts_upsert_skip_delete() -> None:
    class FakeResult:
        def __init__(self, rowcount: int = 0) -> None:
            self.rowcount = rowcount

    class FakeSession:
        def __init__(self) -> None:
            self.executed: list[object] = []
            self.commits = 0

        def execute(self, statement: object) -> FakeResult:
            self.executed.append(statement)
            if "DELETE FROM" in str(statement):
                return FakeResult(rowcount=2)
            return FakeResult(rowcount=0)

        def commit(self) -> None:
            self.commits += 1

    session = FakeSession()
    repo = ChunkRepository(session)  # type: ignore[arg-type]
    repo.get_existing_hashes = lambda document_id: {0: "same-hash"}  # type: ignore[method-assign]

    chunks = [
        ChunkForIndexing(
            chunk_index=0,
            content="keep",
            token_count=1,
            start_offset=0,
            end_offset=4,
            content_hash="same-hash",
            embedding=[0.1],
            model="m",
        ),
        ChunkForIndexing(
            chunk_index=1,
            content="new",
            token_count=1,
            start_offset=5,
            end_offset=8,
            content_hash="new-hash",
            embedding=[0.2],
            model="m",
        ),
    ]

    upserted, skipped, deleted = repo.upsert_chunks(
        document_id="doc-1",
        user_id="user-1",
        chunks=chunks,
    )

    assert upserted == 1
    assert skipped == 1
    assert deleted == 2
    assert session.commits == 1
    assert len(session.executed) >= 2


def test_chunk_repository_upsert_deletes_all_when_chunks_empty() -> None:
    class FakeSession:
        def __init__(self) -> None:
            self.commits = 0

        def execute(self, statement: object):  # noqa: ARG002
            return SimpleNamespace(rowcount=0)

        def commit(self) -> None:
            self.commits += 1

    session = FakeSession()
    repo = ChunkRepository(session)  # type: ignore[arg-type]
    calls: dict[str, object] = {}
    repo.get_existing_hashes = lambda document_id: {}  # type: ignore[method-assign]

    def _delete_document_chunks(**kwargs):
        calls["kwargs"] = kwargs
        return 4

    repo.delete_document_chunks = _delete_document_chunks  # type: ignore[method-assign]

    upserted, skipped, deleted = repo.upsert_chunks(
        document_id="doc-1",
        user_id="user-1",
        chunks=[],
    )

    assert upserted == 0
    assert skipped == 0
    assert deleted == 4
    assert calls["kwargs"] == {"document_id": "doc-1", "user_id": "user-1"}
    assert session.commits == 1


@pytest.mark.asyncio
async def test_vector_retrieve_chunks_maps_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "content": "vector content",
            "start_offset": 0,
            "end_offset": 12,
            "title": "Doc title",
            "original_name": "file.pdf",
            "score": None,
        }
    ]

    class FakeResult:
        def mappings(self):
            return SimpleNamespace(all=lambda: rows)

    class FakeSession:
        async def execute(self, statement):  # noqa: ARG002
            return FakeResult()

    @asynccontextmanager
    async def fake_context():
        yield FakeSession()

    monkeypatch.setattr(chunk_repo_module, "get_async_db_session", fake_context)
    retrieved = await chunk_repo_module.vector_retrieve_chunks(
        user_id="user-1",
        embedding=[0.1, 0.2],
        limit=3,
    )

    assert len(retrieved) == 1
    assert retrieved[0].chunk_id == "chunk-1"
    assert retrieved[0].score == 0.0
    assert retrieved[0].title == "Doc title"


@pytest.mark.asyncio
async def test_fts_retrieve_chunks_maps_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "chunk_id": "chunk-2",
            "document_id": "doc-2",
            "content": "fts content",
            "start_offset": 10,
            "end_offset": 30,
            "title": "Contract",
            "original_name": "contract.pdf",
            "score": 0.87,
        }
    ]

    class FakeResult:
        def mappings(self):
            return SimpleNamespace(all=lambda: rows)

    class FakeSession:
        async def execute(self, statement):  # noqa: ARG002
            return FakeResult()

    @asynccontextmanager
    async def fake_context():
        yield FakeSession()

    monkeypatch.setattr(chunk_repo_module, "get_async_db_session", fake_context)
    retrieved = await chunk_repo_module.fts_retrieve_chunks(
        user_id="user-1",
        query="contract",
        limit=2,
    )

    assert len(retrieved) == 1
    assert retrieved[0].chunk_id == "chunk-2"
    assert retrieved[0].score == pytest.approx(0.87)
    assert retrieved[0].original_name == "contract.pdf"
