import logging
import time
from contextlib import contextmanager

from prometheus_client import CollectorRegistry, Counter, Histogram, push_to_gateway

from core.config import get_settings

logger = logging.getLogger(__name__)


worker_registry = CollectorRegistry()


llm_requests_total = Counter(
    "llm_requests_total",
    "Total number of LLM API requests",
    ["model", "status", "operation", "user_id"],
    registry=worker_registry,
)

llm_tokens_input = Counter(
    "llm_tokens_input_total",
    "Total number of input/prompt tokens used",
    ["model", "operation", "user_id"],
    registry=worker_registry,
)

llm_tokens_output = Counter(
    "llm_tokens_output_total",
    "Total number of output/completion tokens used",
    ["model", "operation", "user_id"],
    registry=worker_registry,
)

llm_tokens_total = Counter(
    "llm_tokens_total",
    "Total number of tokens used (input + output)",
    ["model", "operation", "user_id"],
    registry=worker_registry,
)

llm_request_duration_seconds = Histogram(
    "llm_request_duration_seconds",
    "LLM API request duration in seconds",
    ["model", "operation", "user_id"],
    buckets=[0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0],
    registry=worker_registry,
)

llm_errors_total = Counter(
    "llm_errors_total",
    "Total number of LLM API errors",
    ["model", "error_type", "operation", "user_id"],
    registry=worker_registry,
)


embedding_requests_total = Counter(
    "embedding_requests_total",
    "Total number of embedding API requests",
    ["model", "status", "operation", "user_id"],
    registry=worker_registry,
)

embedding_tokens_total = Counter(
    "embedding_tokens_total",
    "Total number of tokens used for embeddings",
    ["model", "operation", "user_id"],
    registry=worker_registry,
)

embedding_request_duration_seconds = Histogram(
    "embedding_request_duration_seconds",
    "Embedding API request duration in seconds",
    ["model", "operation", "user_id"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
    registry=worker_registry,
)


def push_metrics(job: str = "scribe_worker", grouping_key: dict | None = None):
    settings = get_settings()
    if not settings.metrics_push_enabled:
        return
    try:
        push_to_gateway(
            settings.pushgateway_url,
            job=job,
            registry=worker_registry,
            grouping_key=grouping_key or {},
        )
        logger.debug(f"Pushed metrics to Pushgateway at {settings.pushgateway_url}")
    except Exception as e:
        logger.warning(f"Failed to push metrics to Pushgateway: {e}")


def record_llm_call(
    model: str,
    operation: str,
    user_id: str,
    input_tokens: int,
    output_tokens: int,
    duration_seconds: float,
    status: str = "success",
    error_type: str | None = None,
):
    labels = {"model": model, "operation": operation, "user_id": user_id}

    llm_requests_total.labels(
        model=model, status=status, operation=operation, user_id=user_id
    ).inc()

    if input_tokens > 0:
        llm_tokens_input.labels(**labels).inc(input_tokens)
    if output_tokens > 0:
        llm_tokens_output.labels(**labels).inc(output_tokens)

    total_tokens = input_tokens + output_tokens
    if total_tokens > 0:
        llm_tokens_total.labels(**labels).inc(total_tokens)

    llm_request_duration_seconds.labels(**labels).observe(duration_seconds)

    if status == "error" and error_type:
        llm_errors_total.labels(
            model=model, error_type=error_type, operation=operation, user_id=user_id
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
        },
    )


def record_embedding_call(
    model: str,
    operation: str,
    user_id: str,
    tokens: int,
    duration_seconds: float,
    status: str = "success",
):
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
        },
    )


@contextmanager
def track_llm_call(model: str, operation: str, user_id: str):
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
    def __init__(self):
        self.input_tokens = 0
        self.output_tokens = 0

    def set_tokens(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
