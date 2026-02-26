import time
import contextvars
from typing import Any

from openai import AsyncOpenAI
from core.logging import get_logger
from core.metrics import record_llm_call, record_embedding_call, push_metrics

logger = get_logger(__name__)


current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user_id", default="unknown"
)

current_operation: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_operation", default="unknown"
)


def set_metrics_context(user_id: str, operation: str = "graphiti"):
    current_user_id.set(user_id)
    current_operation.set(operation)


def get_metrics_context() -> tuple[str, str]:
    return current_user_id.get(), current_operation.get()


class InstrumentedAsyncOpenAI(AsyncOpenAI):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self._original_chat_create = self.chat.completions.create
        self.chat.completions.create = self._instrumented_chat_create

        self._original_embeddings_create = self.embeddings.create
        self.embeddings.create = self._instrumented_embeddings_create

        self._langsmith_wrapped = False

    def enable_langsmith_tracing(self) -> "InstrumentedAsyncOpenAI":
        if self._langsmith_wrapped:
            return self

        try:
            from core.langsmith import wrap_openai_client, is_langsmith_enabled

            if is_langsmith_enabled():
                logger.info("LangSmith tracing active for OpenAI client")
                self._langsmith_wrapped = True
        except ImportError:
            pass

        return self

    async def _instrumented_chat_create(self, *args, **kwargs) -> Any:
        model = kwargs.get("model", "unknown")
        user_id, operation = get_metrics_context()

        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

        try:
            response = await self._original_chat_create(*args, **kwargs)
            duration = time.time() - start_time

            if hasattr(response, "usage") and response.usage:
                input_tokens = response.usage.prompt_tokens or 0
                output_tokens = response.usage.completion_tokens or 0

            record_llm_call(
                model=model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_seconds=duration,
                status="success",
            )

            push_metrics()

            logger.debug(
                "LLM call completed",
                model=model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration=duration,
            )

            return response

        except Exception as e:
            duration = time.time() - start_time

            record_llm_call(
                model=model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_seconds=duration,
                status="error",
                error_type=type(e).__name__,
            )

            push_metrics()

            logger.error(
                "LLM call failed",
                model=model,
                operation=operation,
                user_id=user_id,
                error=str(e),
                duration=duration,
            )
            raise

    async def _instrumented_embeddings_create(self, *args, **kwargs) -> Any:
        model = kwargs.get("model", "unknown")
        user_id, operation = get_metrics_context()

        start_time = time.time()
        tokens = 0

        try:
            response = await self._original_embeddings_create(*args, **kwargs)
            duration = time.time() - start_time

            if hasattr(response, "usage") and response.usage:
                tokens = response.usage.total_tokens or 0

            record_embedding_call(
                model=model,
                operation=operation,
                user_id=user_id,
                tokens=tokens,
                duration_seconds=duration,
                status="success",
            )

            push_metrics()

            logger.debug(
                "Embedding call completed",
                model=model,
                operation=operation,
                user_id=user_id,
                tokens=tokens,
                duration=duration,
            )

            return response

        except Exception as e:
            duration = time.time() - start_time

            record_embedding_call(
                model=model,
                operation=operation,
                user_id=user_id,
                tokens=0,
                duration_seconds=duration,
                status="error",
            )

            push_metrics()

            logger.error(
                "Embedding call failed",
                model=model,
                operation=operation,
                user_id=user_id,
                error=str(e),
                duration=duration,
            )
            raise
