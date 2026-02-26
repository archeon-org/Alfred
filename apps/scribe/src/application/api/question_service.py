import re
import time
from dataclasses import dataclass
from typing import Any

from core.instrumented_openai import InstrumentedAsyncOpenAI
from core.langsmith import is_langsmith_enabled, wrap_openai_client
from core.logging import get_logger
from graphrag import retrieve_context_for_query
from graphrag.config import get_graphiti_settings
from application.api.errors import ApiServiceError

logger = get_logger(__name__)

NO_CONTEXT_MESSAGE = (
    "I couldn't find relevant information in your documents to answer this question. "
    "This might be because:\n"
    "- The relevant documents haven't been uploaded yet\n"
    "- The information is described differently in your documents\n"
    "- The documents are still being processed\n\n"
    "Try rephrasing your question or uploading relevant documents."
)

SYSTEM_PROMPT_TEMPLATE = """You are the user's personal assistant with complete access to their documents, contracts, notes, and knowledge base.

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


@dataclass(frozen=True, slots=True)
class QuestionAnswer:
    answer: str
    context_used: str
    sources: list[str]
    processing_time_ms: float
    confidence: str


class QuestionService:
    def __init__(self) -> None:
        self._client: Any | None = None

    async def execute_question(
        self,
        user_id: str,
        question: str,
        max_context_results: int,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> QuestionAnswer:
        logger.info(f"Question from user {user_id}: {question[:100]}...")
        try:
            result = await self.answer_question(
                user_id=user_id,
                question=question,
                max_context_results=max_context_results,
                conversation_history=conversation_history,
            )
        except Exception as error:
            logger.error(f"Question failed: {error}", exc_info=True)
            raise ApiServiceError(f"Failed to answer question: {error}") from error
        logger.info(
            f"Question answered in {result.processing_time_ms:.1f}ms, "
            f"confidence={result.confidence}"
        )
        return result

    async def answer_question(
        self,
        user_id: str,
        question: str,
        max_context_results: int,
        conversation_history: list[dict[str, Any]] | None = None,
    ) -> QuestionAnswer:
        started_at = time.perf_counter()
        context = await retrieve_context_for_query(
            user_id=user_id,
            query=question,
            num_results=max_context_results,
            include_communities=True,
        )
        if not self._has_context(context):
            return QuestionAnswer(
                answer=NO_CONTEXT_MESSAGE,
                context_used="No relevant context found",
                sources=[],
                processing_time_ms=self._elapsed_ms(started_at),
                confidence="low",
            )
        answer = await self._generate_answer(question, context, conversation_history)
        sources = self._extract_sources(context)
        confidence = self._determine_confidence(context)
        return QuestionAnswer(
            answer=answer,
            context_used=context,
            sources=sources,
            processing_time_ms=self._elapsed_ms(started_at),
            confidence=confidence,
        )

    async def _generate_answer(
        self,
        question: str,
        context: str,
        conversation_history: list[dict[str, Any]] | None,
    ) -> str:
        settings = get_graphiti_settings()
        client = self._get_client()
        messages = self._build_messages(question, context, conversation_history)
        response = await client.chat.completions.create(
            model=settings.openai.model,
            messages=messages,
            max_tokens=2048,
            temperature=0.3,
        )
        return response.choices[0].message.content or "I couldn't generate an answer."

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        settings = get_graphiti_settings()
        client: Any = InstrumentedAsyncOpenAI(
            api_key=settings.openai.api_key.get_secret_value(),
            base_url=settings.openai.base_url,
        )
        if is_langsmith_enabled():
            client = wrap_openai_client(client, "question_service")
        self._client = client
        return self._client

    @staticmethod
    def _build_messages(
        question: str,
        context: str,
        conversation_history: list[dict[str, Any]] | None,
    ) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT_TEMPLATE.format(context=context)}
        ]
        if conversation_history:
            for message in conversation_history[-6:]:
                role = message.get("role")
                content = message.get("content")
                if role in {"user", "assistant"} and isinstance(content, str):
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question})
        return messages

    @staticmethod
    def _extract_sources(context: str) -> list[str]:
        sources = re.findall(r"\*\*([^*]+)\*\*", context)
        return list(dict.fromkeys(sources))[:10]

    @staticmethod
    def _determine_confidence(context: str) -> str:
        context_lines = context.count("\n")
        fact_count = context.count("1.") + context.count("2.") + context.count("3.")
        if fact_count >= 5 or context_lines >= 10:
            return "high"
        if fact_count >= 2 or context_lines >= 5:
            return "medium"
        return "low"

    @staticmethod
    def _has_context(context: str) -> bool:
        return bool(context and "No relevant information found" not in context)

    @staticmethod
    def _elapsed_ms(started_at: float) -> float:
        return round((time.perf_counter() - started_at) * 1000, 2)


_question_service: QuestionService | None = None


def get_question_service() -> QuestionService:
    global _question_service
    if _question_service is None:
        _question_service = QuestionService()
    return _question_service
