from rag.agents.context_assembly_agent import ContextAssemblyAgent
from rag.agents.hybrid_retrieve_agent import HybridRetrieveAgent
from rag.agents.query_rewrite_agent import QueryRewriteAgent
from rag.agents.rerank_agent import RerankAgent
from rag.types import RetrievedChunk


def _chunk(
    chunk_id: str,
    document_id: str,
    score: float,
    title: str | None = None,
    original_name: str | None = None,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id=document_id,
        content=f"content for {chunk_id}",
        score=score,
        start_offset=0,
        end_offset=20,
        title=title,
        original_name=original_name,
    )


def test_query_rewrite_uses_recent_context_for_short_queries() -> None:
    agent = QueryRewriteAgent()
    rewritten = agent.rewrite(
        query="and invoices?",
        conversation_history=[
            {"role": "user", "content": "show me contracts from 2024"},
            {"role": "assistant", "content": "found 2 contracts"},
        ],
    )
    assert rewritten == "show me contracts from 2024 and invoices?"


def test_hybrid_merge_combines_vector_and_keyword_scores() -> None:
    agent = HybridRetrieveAgent(embedding_client=object())

    vector_hits = [
        _chunk("c1", "d1", 0.9, title="Invoice January"),
        _chunk("c2", "d2", 0.6, title="Contract"),
    ]
    keyword_hits = [
        _chunk("c2", "d2", 0.7, title="Contract"),
        _chunk("c3", "d3", 0.8, title="Invoice February"),
    ]

    merged = agent._merge(vector_hits, keyword_hits, query="invoice")
    assert len(merged) == 3
    assert merged[0].merged_score >= merged[1].merged_score
    assert merged[1].merged_score >= merged[2].merged_score


def test_rerank_limits_per_document_and_total() -> None:
    agent = RerankAgent()
    chunks = []
    for idx in range(8):
        chunk = _chunk(f"c{idx}", "d1", 1 - idx * 0.05)
        chunk.merged_score = 1 - idx * 0.05
        chunks.append(chunk)
    for idx in range(4):
        chunk = _chunk(f"x{idx}", "d2", 0.8 - idx * 0.05)
        chunk.merged_score = 0.8 - idx * 0.05
        chunks.append(chunk)

    reranked = agent.rerank(chunks=chunks, limit=6)
    assert len(reranked) == 6
    assert sum(1 for chunk in reranked if chunk.document_id == "d1") <= 4


def test_context_assembly_preserves_chunk_citations() -> None:
    agent = ContextAssemblyAgent()
    chunks = [
        _chunk("chunk-1", "doc-1", 0.92, title="Doc A"),
        _chunk("chunk-2", "doc-2", 0.85, title="Doc B"),
    ]
    chunks[0].merged_score = 0.92
    chunks[1].merged_score = 0.85

    assembled = agent.assemble(chunks=chunks, max_tokens=500)

    assert len(assembled.citations) == 2
    assert assembled.citations[0].chunk_id == "chunk-1"
    assert assembled.citations[1].document_id == "doc-2"
    assert "[chunk-1]" in assembled.context
