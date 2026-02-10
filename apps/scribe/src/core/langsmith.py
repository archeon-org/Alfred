"""
LangSmith Integration for LLM Observability

Provides tracing and monitoring for all LLM calls through LangSmith.
This allows independent verification of token usage and request counts
compared to Prometheus metrics.

Environment Variables:
    LANGSMITH_API_KEY: Your LangSmith API key (required to enable)
    LANGSMITH_PROJECT: Project name in LangSmith (default: "archeon-scribe")
    LANGSMITH_TRACING: Set to "true" to enable tracing (default: "true" if API key exists)
"""

from __future__ import annotations

import os
import logging
from functools import wraps
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

# Track if LangSmith is initialized
_langsmith_enabled: bool = False


def is_langsmith_enabled() -> bool:
    """Check if LangSmith tracing is enabled."""
    return _langsmith_enabled


def initialize_langsmith() -> bool:
    """
    Initialize LangSmith tracing if API key is configured.
    
    Returns True if LangSmith is enabled, False otherwise.
    Should be called once at application startup.
    """
    global _langsmith_enabled
    
    api_key = os.environ.get("LANGSMITH_API_KEY", "")
    
    if not api_key:
        logger.info("LangSmith disabled: LANGSMITH_API_KEY not set")
        _langsmith_enabled = False
        return False
    
    # Set required environment variables for LangSmith
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = api_key
    
    project = os.environ.get("LANGSMITH_PROJECT", "archeon-scribe")
    os.environ["LANGCHAIN_PROJECT"] = project
    
    # Optional: Set endpoint if using self-hosted
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
    """
    Decorator to trace an LLM call with LangSmith.
    
    Usage:
        @trace_llm_call("graphiti_entity_extraction", tags=["graphiti"])
        async def extract_entities(content: str) -> dict:
            ...
    
    Parameters
    ----------
    name : str
        Name of the run in LangSmith
    metadata : dict, optional
        Additional metadata to attach to the run
    tags : list[str], optional
        Tags for filtering in LangSmith UI
    """
    def decorator(func: F) -> F:
        if not _langsmith_enabled:
            return func
        
        try:
            from langsmith import traceable
            
            return traceable(
                name=name,
                metadata=metadata or {},
                tags=tags or [],
            )(func)
        except ImportError:
            logger.warning("langsmith package not installed, tracing disabled")
            return func
    
    return decorator


def wrap_openai_client(client: Any, run_name: str = "openai_call") -> Any:
    """
    Wrap an OpenAI client to automatically trace all calls with LangSmith.
    
    This uses LangSmith's built-in OpenAI instrumentation.
    
    Parameters
    ----------
    client : AsyncOpenAI
        The OpenAI client to wrap
    run_name : str
        Name prefix for runs in LangSmith
        
    Returns
    -------
    The wrapped client (or original if LangSmith is disabled)
    """
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
    run_type: str = "chain",
    inputs: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    tags: list[str] | None = None,
):
    """
    Create a LangSmith run context manager for manual tracing.
    
    Usage:
        with create_langsmith_run("process_document", inputs={"doc_id": "123"}) as run:
            result = do_something()
            run.end(outputs={"result": result})
    
    Returns a no-op context manager if LangSmith is disabled.
    """
    if not _langsmith_enabled:
        from contextlib import nullcontext
        return nullcontext()
    
    try:
        from langsmith import Client
        from langsmith.run_helpers import trace
        
        return trace(
            name=name,
            run_type=run_type,
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
    """
    Get a LangSmith client for direct API access.
    
    Returns None if LangSmith is not enabled.
    """
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
