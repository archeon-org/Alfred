from __future__ import annotations

import asyncio
import base64
import binascii
import json
import struct
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from openai import AsyncOpenAI

from core.config import get_settings
from core.langsmith import is_langsmith_enabled, wrap_openai_client
from core.logging import get_logger
from rag.types import RagAgentMode, RagUserContext

logger = get_logger(__name__)
_T = TypeVar("_T")


class RagEmbeddingClient:
    def __init__(self) -> None:
        settings = get_settings()
        ai = settings.ai

        client: Any = AsyncOpenAI(
            api_key=ai.fireworks_api_key.get_secret_value(),
            base_url=ai.fireworks_base_url,
        )
        if is_langsmith_enabled():
            client = wrap_openai_client(client, "rag_client")
        self._client = client
        self._embedding_model = ai.embedding_model
        self._embedding_dimensions = ai.embedding_dimensions
        self._answer_model = ai.classification_model

    async def embed_texts(self, user_id: str, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        response = await self._with_retry(
            operation_name="embed_texts",
            action=lambda: self._client.embeddings.create(
                model=self._embedding_model,
                input=texts,
                dimensions=self._embedding_dimensions,
                encoding_format="float",
            ),
        )
        vectors: list[list[float]] = [
            self._normalize_embedding(item.embedding, idx) for idx, item in enumerate(response.data)
        ]
        return vectors

    def _normalize_embedding(self, embedding: Any, index: int) -> list[float]:
        if isinstance(embedding, str):
            embedding = self._parse_embedding_string(embedding, index)

        if isinstance(embedding, tuple):
            embedding = list(embedding)

        if not isinstance(embedding, list):
            raise ValueError(f"Embedding #{index} has unsupported type: {type(embedding).__name__}")

        try:
            vector = [float(value) for value in embedding]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Embedding #{index} contains non-numeric values") from exc

        if len(vector) != self._embedding_dimensions:
            logger.warning(
                "Unexpected embedding dimensions",
                index=index,
                expected=self._embedding_dimensions,
                received=len(vector),
            )

        return vector

    def _parse_embedding_string(self, raw: str, index: int) -> list[float]:
        stripped = raw.strip()
        if not stripped:
            raise ValueError(f"Embedding #{index} is an empty string")

        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Embedding #{index} string is not valid JSON array") from exc
            if not isinstance(parsed, list):
                raise ValueError(f"Embedding #{index} JSON payload is not a list")
            return [float(value) for value in parsed]

        try:
            payload = base64.b64decode(stripped, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError(
                f"Embedding #{index} is neither a JSON array nor valid base64"
            ) from exc

        if len(payload) % 4 != 0:
            raise ValueError(
                f"Embedding #{index} base64 payload has invalid byte length: {len(payload)}"
            )

        return [
            struct.unpack_from("<f", payload, offset)[0] for offset in range(0, len(payload), 4)
        ]

    async def generate_answer(
        self,
        user_id: str,
        query: str,
        context: str,
        conversation_history: list[dict[str, str]] | None = None,
        agent_mode: RagAgentMode = "normal",
        user_context: RagUserContext | None = None,
    ) -> str:
        reasoning_mode = agent_mode == "reasoning"
        user_context_text = self._format_user_context(user_context)
        messages: list[dict[str, str]] = [
            {
                "role": "system",
                "content": (
                    "You answer questions using provided context chunks only. "
                    "Be concise and factual. Cite chunk IDs from context in brackets for each key claim. "
                    "If context is insufficient, say so clearly. "
                    "Use user profile and current date context when resolving temporal language "
                    "(for example today, last month, next week). "
                    "Never mention hidden credentials, secret keys, or passwords. "
                    + (
                        "Use deeper reasoning across multiple snippets before concluding."
                        if reasoning_mode
                        else "Prioritize speed and directness."
                    )
                ),
            }
        ]

        if user_context_text:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Known user context (sanitized non-secret account metadata):\n"
                        f"{user_context_text}"
                    ),
                }
            )

        if conversation_history:
            for message in conversation_history[-6:]:
                role = message.get("role")
                content = message.get("content")
                if role in {"user", "assistant"} and isinstance(content, str):
                    messages.append({"role": role, "content": content})

        messages.append(
            {
                "role": "user",
                "content": f"Question: {query}\n\nContext:\n{context}",
            }
        )

        response = await self._with_retry(
            operation_name="generate_answer",
            action=lambda: self._client.chat.completions.create(
                model=self._answer_model,
                messages=messages,
                temperature=0.25 if reasoning_mode else 0.1,
                max_tokens=1600 if reasoning_mode else 1200,
            ),
        )

        content = response.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            logger.warning("Empty answer from model", user_id=user_id)
            return "I could not produce an answer from your indexed documents."

        return content.strip()

    @staticmethod
    def _format_user_context(user_context: RagUserContext | None) -> str:
        if not user_context:
            return ""

        field_mapping = [
            ("user_id", "User ID"),
            ("full_name", "Full name"),
            ("first_name", "First name"),
            ("last_name", "Last name"),
            ("email", "Email"),
            ("timezone", "Timezone"),
            ("locale", "Locale"),
            ("current_date", "Current date"),
            ("current_datetime_iso", "Current datetime (ISO)"),
            ("day_of_week", "Day of week"),
        ]
        lines: list[str] = []
        for field_name, label in field_mapping:
            value = user_context.get(field_name)
            if isinstance(value, str) and value.strip():
                lines.append(f"- {label}: {value.strip()}")
        return "\n".join(lines)

    async def _with_retry(
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
        raise last_error

    @staticmethod
    def _is_retryable_error(error: Exception) -> bool:
        retryable_tokens = {
            "rate",
            "timeout",
            "connection",
            "temporarily unavailable",
            "service unavailable",
            "too many requests",
            "429",
            "503",
        }
        error_text = str(error).lower()
        error_name = error.__class__.__name__.lower()
        return any(token in error_text or token in error_name for token in retryable_tokens)


_rag_embedding_client: RagEmbeddingClient | None = None


def get_rag_embedding_client() -> RagEmbeddingClient:
    global _rag_embedding_client
    if _rag_embedding_client is None:
        _rag_embedding_client = RagEmbeddingClient()
    return _rag_embedding_client
