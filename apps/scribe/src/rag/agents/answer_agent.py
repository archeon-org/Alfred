from __future__ import annotations

from rag.embedding_client import RagEmbeddingClient
from rag.types import RagAgentMode, RagUserContext


class AnswerAgent:
    def __init__(self, embedding_client: RagEmbeddingClient) -> None:
        self._embedding_client = embedding_client

    async def answer(
        self,
        *,
        user_id: str,
        query: str,
        context: str,
        conversation_history: list[dict[str, str]] | None,
        agent_mode: RagAgentMode = "normal",
        user_context: RagUserContext | None = None,
    ) -> str:
        return await self._embedding_client.generate_answer(
            user_id=user_id,
            query=query,
            context=context,
            conversation_history=conversation_history,
            agent_mode=agent_mode,
            user_context=user_context,
        )
