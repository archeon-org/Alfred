"""
LLM Metrics with Pushgateway Support

Prometheus metrics for tracking LLM API calls and token usage.
Uses Pushgateway for Celery worker metrics since workers run in separate processes.
"""

import os
import time
import logging
from contextlib import contextmanager
from typing import Optional
from functools import wraps

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Histogram,
    Gauge,
    push_to_gateway,
    REGISTRY,
)

logger = logging.getLogger(__name__)

# Pushgateway URL (uses Docker service name)
PUSHGATEWAY_URL = os.environ.get("PUSHGATEWAY_URL", "pushgateway:9091")

# Create a separate registry for worker metrics (pushed to gateway)
worker_registry = CollectorRegistry()

# ============================================================================
# LLM Metrics (for Pushgateway - used by Celery workers)
# ============================================================================

llm_requests_total = Counter(
    'llm_requests_total',
    'Total number of LLM API requests',
    ['model', 'status', 'operation', 'user_id'],
    registry=worker_registry
)

llm_tokens_input = Counter(
    'llm_tokens_input_total',
    'Total number of input/prompt tokens used',
    ['model', 'operation', 'user_id'],
    registry=worker_registry
)

llm_tokens_output = Counter(
    'llm_tokens_output_total',
    'Total number of output/completion tokens used',
    ['model', 'operation', 'user_id'],
    registry=worker_registry
)

llm_tokens_total = Counter(
    'llm_tokens_total',
    'Total number of tokens used (input + output)',
    ['model', 'operation', 'user_id'],
    registry=worker_registry
)

llm_request_duration_seconds = Histogram(
    'llm_request_duration_seconds',
    'LLM API request duration in seconds',
    ['model', 'operation', 'user_id'],
    buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0],
    registry=worker_registry
)

llm_errors_total = Counter(
    'llm_errors_total',
    'Total number of LLM API errors',
    ['model', 'error_type', 'operation', 'user_id'],
    registry=worker_registry
)

# Embedding metrics
embedding_requests_total = Counter(
    'embedding_requests_total',
    'Total number of embedding API requests',
    ['model', 'status', 'operation', 'user_id'],
    registry=worker_registry
)

embedding_tokens_total = Counter(
    'embedding_tokens_total',
    'Total number of tokens used for embeddings',
    ['model', 'operation', 'user_id'],
    registry=worker_registry
)

embedding_request_duration_seconds = Histogram(
    'embedding_request_duration_seconds',
    'Embedding API request duration in seconds',
    ['model', 'operation', 'user_id'],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=worker_registry
)


def push_metrics(job: str = "scribe_worker", grouping_key: Optional[dict] = None):
    """
    Push current metrics to Pushgateway.
    
    Call this after completing a Celery task to ensure metrics are persisted.
    
    Parameters
    ----------
    job : str
        The job name for grouping in Pushgateway
    grouping_key : dict, optional
        Additional grouping keys (e.g., {"instance": "worker-1"})
    """
    try:
        push_to_gateway(
            PUSHGATEWAY_URL,
            job=job,
            registry=worker_registry,
            grouping_key=grouping_key or {},
        )
        logger.debug(f"Pushed metrics to Pushgateway at {PUSHGATEWAY_URL}")
    except Exception as e:
        # Don't fail the task if metrics push fails
        logger.warning(f"Failed to push metrics to Pushgateway: {e}")


def record_llm_call(
    model: str,
    operation: str,
    user_id: str,
    input_tokens: int,
    output_tokens: int,
    duration_seconds: float,
    status: str = "success",
    error_type: Optional[str] = None,
):
    """
    Record metrics for an LLM API call.
    
    Parameters
    ----------
    model : str
        The model name (e.g., "llama-v3p1-70b-instruct")
    operation : str
        The operation type (e.g., "graphiti_ingestion", "classification")
    user_id : str
        The user ID for filtering
    input_tokens : int
        Number of input/prompt tokens
    output_tokens : int
        Number of output/completion tokens
    duration_seconds : float
        Request duration in seconds
    status : str
        "success" or "error"
    error_type : str, optional
        Error type name if status is "error"
    """
    labels = {"model": model, "operation": operation, "user_id": user_id}
    
    # Track request count
    llm_requests_total.labels(model=model, status=status, operation=operation, user_id=user_id).inc()
    
    # Track tokens
    if input_tokens > 0:
        llm_tokens_input.labels(**labels).inc(input_tokens)
    if output_tokens > 0:
        llm_tokens_output.labels(**labels).inc(output_tokens)
    
    total_tokens = input_tokens + output_tokens
    if total_tokens > 0:
        llm_tokens_total.labels(**labels).inc(total_tokens)
    
    # Track duration
    llm_request_duration_seconds.labels(**labels).observe(duration_seconds)
    
    # Track errors
    if status == "error" and error_type:
        llm_errors_total.labels(
            model=model,
            error_type=error_type,
            operation=operation,
            user_id=user_id
        ).inc()
    
    logger.debug(
        "Recorded LLM metrics",
        extra={
            "model": model,
            "operation": operation,
            "user_id": user_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "duration": duration_seconds,
            "status": status,
        }
    )


def record_embedding_call(
    model: str,
    operation: str,
    user_id: str,
    tokens: int,
    duration_seconds: float,
    status: str = "success",
):
    """
    Record metrics for an embedding API call.
    
    Parameters
    ----------
    model : str
        The embedding model name
    operation : str
        The operation type
    user_id : str
        The user ID for filtering
    tokens : int
        Number of tokens processed
    duration_seconds : float
        Request duration in seconds
    status : str
        "success" or "error"
    """
    labels = {"model": model, "operation": operation, "user_id": user_id}
    
    embedding_requests_total.labels(
        model=model, status=status, operation=operation, user_id=user_id
    ).inc()
    
    if tokens > 0:
        embedding_tokens_total.labels(**labels).inc(tokens)
    
    embedding_request_duration_seconds.labels(**labels).observe(duration_seconds)
    
    logger.debug(
        "Recorded embedding metrics",
        extra={
            "model": model,
            "operation": operation,
            "user_id": user_id,
            "tokens": tokens,
            "duration": duration_seconds,
            "status": status,
        }
    )


@contextmanager
def track_llm_call(model: str, operation: str, user_id: str):
    """
    Context manager to track an LLM call.
    
    Usage:
        with track_llm_call("model", "operation", "user_id") as tracker:
            response = await client.chat.completions.create(...)
            tracker.set_tokens(response.usage.prompt_tokens, response.usage.completion_tokens)
    """
    start_time = time.time()
    tracker = LLMCallTracker()
    
    try:
        yield tracker
        duration = time.time() - start_time
        record_llm_call(
            model=model,
            operation=operation,
            user_id=user_id,
            input_tokens=tracker.input_tokens,
            output_tokens=tracker.output_tokens,
            duration_seconds=duration,
            status="success",
        )
    except Exception as e:
        duration = time.time() - start_time
        record_llm_call(
            model=model,
            operation=operation,
            user_id=user_id,
            input_tokens=tracker.input_tokens,
            output_tokens=tracker.output_tokens,
            duration_seconds=duration,
            status="error",
            error_type=type(e).__name__,
        )
        raise


class LLMCallTracker:
    """Helper class for tracking tokens during an LLM call."""
    
    def __init__(self):
        self.input_tokens = 0
        self.output_tokens = 0
    
    def set_tokens(self, input_tokens: int, output_tokens: int):
        """Set the token counts after receiving the response."""
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens

