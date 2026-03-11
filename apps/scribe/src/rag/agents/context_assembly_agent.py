from __future__ import annotations

from dataclasses import dataclass

from rag.types import RagCitation, RetrievedChunk


@dataclass(frozen=True, slots=True)
class AssembledContext:
    context: str
    citations: list[RagCitation]
    selected_chunks: list[RetrievedChunk]


class ContextAssemblyAgent:
    def assemble(
        self,
        *,
        chunks: list[RetrievedChunk],
        max_tokens: int,
    ) -> AssembledContext:
        if not chunks:
            return AssembledContext(
                context="No relevant chunks were found.",
                citations=[],
                selected_chunks=[],
            )

        selected_chunks: list[RetrievedChunk] = []
        citations: list[RagCitation] = []
        lines: list[str] = ["Use only these snippets as evidence:"]

        used_tokens = 0
        for chunk in chunks:
            token_estimate = max(1, len(chunk.content) // 4)
            if used_tokens + token_estimate > max_tokens and selected_chunks:
                break

            snippet = chunk.content.strip()
            if len(snippet) > 320:
                snippet = snippet[:317].rstrip() + "..."

            lines.append(f"- [{chunk.chunk_id}] {chunk.display_name()} :: {snippet}")

            citation = RagCitation(
                chunk_id=chunk.chunk_id,
                document_id=chunk.document_id,
                snippet=snippet,
                score=round(chunk.merged_score, 4),
                start_offset=chunk.start_offset,
                end_offset=chunk.end_offset,
            )
            citations.append(citation)
            selected_chunks.append(chunk)
            used_tokens += token_estimate

        return AssembledContext(
            context="\n".join(lines),
            citations=citations,
            selected_chunks=selected_chunks,
        )
