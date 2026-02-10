"""
Instrumented OpenAI Client

Wraps the OpenAI client to track metrics for all LLM and embedding calls.
This is used by Graphiti to automatically track token usage.

Supports two monitoring backends:
1. Prometheus metrics (pushed to Pushgateway)
2. LangSmith tracing (for detailed request-level visibility)
"""

import time
import contextvars
from typing import Any

from openai import AsyncOpenAI
from core.logging import get_logger
from core.metrics import record_llm_call, record_embedding_call, push_metrics

logger = get_logger(__name__)

# Context variables to track current user_id and operation for metrics
current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    'current_user_id', default='unknown'
)

current_operation: contextvars.ContextVar[str] = contextvars.ContextVar(
    'current_operation', default='unknown'
)


def set_metrics_context(user_id: str, operation: str = "graphiti"):
    """Set the current user_id and operation for metrics tracking."""
    current_user_id.set(user_id)
    current_operation.set(operation)


def get_metrics_context() -> tuple[str, str]:
    """Get the current user_id and operation."""
    return current_user_id.get(), current_operation.get()


class InstrumentedAsyncOpenAI(AsyncOpenAI):
    """
    AsyncOpenAI client with Prometheus metrics instrumentation.
    
    Automatically tracks:
    - Request counts by model, status, operation, user
    - Input/output tokens
    - Request duration
    - Errors
    
    Metrics are pushed to Pushgateway after each call.
    LangSmith tracing is enabled if LANGSMITH_API_KEY is set.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Wrap the chat completions create method
        self._original_chat_create = self.chat.completions.create
        self.chat.completions.create = self._instrumented_chat_create
        
        # Wrap the embeddings create method
        self._original_embeddings_create = self.embeddings.create
        self.embeddings.create = self._instrumented_embeddings_create
        
        # Track if this client has been wrapped with LangSmith
        self._langsmith_wrapped = False
    
    def enable_langsmith_tracing(self) -> "InstrumentedAsyncOpenAI":
        """
        Enable LangSmith tracing on this client.
        
        Call this after creating the client to add LangSmith instrumentation.
        Returns self for method chaining.
        """
        if self._langsmith_wrapped:
            return self
            
        try:
            from core.langsmith import wrap_openai_client, is_langsmith_enabled
            
            if is_langsmith_enabled():
                # LangSmith wraps at a lower level, we just log that it's active
                logger.info("LangSmith tracing active for OpenAI client")
                self._langsmith_wrapped = True
        except ImportError:
            pass
        
        return self
    
    async def _instrumented_chat_create(self, *args, **kwargs) -> Any:
        """Instrumented chat completions create."""
        model = kwargs.get('model', 'unknown')
        user_id, operation = get_metrics_context()
        
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0
        
        try:
            response = await self._original_chat_create(*args, **kwargs)
            duration = time.time() - start_time
            
            # Extract tokens from response
            if hasattr(response, 'usage') and response.usage:
                input_tokens = response.usage.prompt_tokens or 0
                output_tokens = response.usage.completion_tokens or 0
            
            # Record metrics
            record_llm_call(
                model=model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_seconds=duration,
                status="success",
            )
            
            # Push metrics to Pushgateway
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
        """Instrumented embeddings create."""
        model = kwargs.get('model', 'unknown')
        user_id, operation = get_metrics_context()
        
        start_time = time.time()
        tokens = 0
        
        try:
            response = await self._original_embeddings_create(*args, **kwargs)
            duration = time.time() - start_time
            
            # Extract tokens from response
            if hasattr(response, 'usage') and response.usage:
                tokens = response.usage.total_tokens or 0
            
            # Record metrics
            record_embedding_call(
                model=model,
                operation=operation,
                user_id=user_id,
                tokens=tokens,
                duration_seconds=duration,
                status="success",
            )
            
            # Push metrics to Pushgateway
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
