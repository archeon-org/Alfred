from __future__ import annotations

import logging
import os
from collections.abc import Callable
from typing import Any, TypeVar

logger = logging.getLogger(__name__)


_langsmith_enabled: bool = False


def is_langsmith_enabled() -> bool:
    return _langsmith_enabled


def initialize_langsmith() -> bool:
    global _langsmith_enabled

    api_key = os.environ.get("LANGSMITH_API_KEY", "")

    if not api_key:
        logger.info("LangSmith disabled: LANGSMITH_API_KEY not set")
        _langsmith_enabled = False
        return False

    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = api_key

    project = os.environ.get("LANGSMITH_PROJECT", "archeon-scribe")
    os.environ["LANGCHAIN_PROJECT"] = project

    endpoint = os.environ.get("LANGSMITH_ENDPOINT")
    if endpoint:
        os.environ["LANGCHAIN_ENDPOINT"] = endpoint

    logger.info(
        f"LangSmith tracing enabled for project: {project}",
        extra={"project": project},
    )

    _langsmith_enabled = True
    return True


F = TypeVar("F", bound=Callable[..., Any])


def trace_llm_call(
    name: str,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
) -> Callable[[F], F]:
    def decorator(func: F) -> F:
        if not _langsmith_enabled:
            return func

        try:
            from langsmith import traceable

            return traceable(  # type: ignore[return-value]
                name=name,
                metadata=metadata or {},
                tags=tags or [],
            )(func)
        except ImportError:
            logger.warning("langsmith package not installed, tracing disabled")
            return func

    return decorator


def wrap_openai_client(client: Any, run_name: str = "openai_call") -> Any:
    if not _langsmith_enabled:
        return client

    try:
        from langsmith.wrappers import wrap_openai

        wrapped = wrap_openai(client)
        logger.debug(f"Wrapped OpenAI client with LangSmith tracing: {run_name}")
        return wrapped
    except ImportError:
        logger.warning("langsmith.wrappers not available, using unwrapped client")
        return client
    except Exception as e:
        logger.warning(f"Failed to wrap OpenAI client: {e}")
        return client


def create_langsmith_run(
    name: str,
    run_type: str = "chain",  # noqa: PYI051
    inputs: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
):
    if not _langsmith_enabled:
        from contextlib import nullcontext

        return nullcontext()

    try:
        from langsmith.run_helpers import trace

        return trace(
            name=name,
            run_type=run_type,  # type: ignore[arg-type]
            inputs=inputs or {},
            metadata=metadata or {},
            tags=tags or [],
        )
    except ImportError:
        from contextlib import nullcontext

        return nullcontext()
    except Exception as e:
        logger.warning(f"Failed to create LangSmith run: {e}")
        from contextlib import nullcontext

        return nullcontext()


def get_langsmith_client():
    if not _langsmith_enabled:
        return None

    try:
        from langsmith import Client

        return Client()
    except ImportError:
        return None
    except Exception as e:
        logger.warning(f"Failed to create LangSmith client: {e}")
        return None
