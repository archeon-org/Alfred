"""
Graphiti Client Management

Single Responsibility: Manage Graphiti client lifecycle.
- Initialization with Neo4j and LLM configuration
- Event loop aware singleton pattern
- Graceful shutdown
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import TYPE_CHECKING

from graphrag.config import get_graphiti_settings

if TYPE_CHECKING:
    from graphiti_core import Graphiti

logger = logging.getLogger(__name__)

# Global Graphiti client instance and its event loop
_graphiti_client: "Graphiti | None" = None
_graphiti_loop_id: int | None = None


def _get_current_loop_id() -> int:
    """Get ID of current event loop, or 0 if none."""
    try:
        loop = asyncio.get_running_loop()
        return id(loop)
    except RuntimeError:
        return 0


async def initialize_graphiti(force_new: bool = False) -> "Graphiti":
    """
    Initialize and return the Graphiti client connected to Neo4j.

    Creates a non-blocking connection to the Neo4j instance,
    instantiates the Graphiti client with LLM configuration,
    and ensures all necessary indices and constraints are built.

    Parameters
    ----------
    force_new : bool
        If True, create a new client even if one exists.
        Useful when event loop has changed (e.g., in Celery workers).

    Returns
    -------
    Graphiti
        The initialized Graphiti client ready for use.

    Raises
    ------
    ValueError
        If Graphiti is disabled or required credentials missing.
    ConnectionError
        If unable to connect to Neo4j.
    """
    global _graphiti_client, _graphiti_loop_id

    current_loop_id = _get_current_loop_id()

    # Check if we can reuse existing client
    if _graphiti_client is not None and not force_new:
        if _graphiti_loop_id == current_loop_id:
            logger.debug("Returning existing Graphiti client")
            return _graphiti_client
        else:
            # Event loop changed - close old client
            logger.info("Event loop changed, reinitializing Graphiti client")
            try:
                await _graphiti_client.close()
            except Exception as e:
                logger.warning(f"Error closing old Graphiti client: {e}")
            _graphiti_client = None
            _graphiti_loop_id = None

    settings = get_graphiti_settings()

    if not settings.enabled:
        raise ValueError("Graphiti is disabled in configuration")

    # Validate required credentials
    openai_key = settings.openai.api_key.get_secret_value()
    if not openai_key:
        raise ValueError("OPENAI_API_KEY environment variable is required")

    # Set environment variables for graphiti-core
    os.environ["OPENAI_API_KEY"] = openai_key
    if settings.openai.base_url:
        os.environ["OPENAI_BASE_URL"] = settings.openai.base_url

    logger.info(
        f"Initializing Graphiti with Neo4j at {settings.neo4j.uri}",
        extra={
            "neo4j_uri": settings.neo4j.uri,
            "llm_base_url": settings.openai.base_url or "default (OpenAI)",
        },
    )

    try:
        client = await _create_client(settings, openai_key)
        await _build_indices(client)

        _graphiti_client = client
        _graphiti_loop_id = current_loop_id

        logger.info("Graphiti initialization complete")
        return client

    except ImportError as e:
        logger.error(f"Failed to import graphiti-core: {e}")
        raise ImportError(
            "graphiti-core is not installed. Install with: pip install graphiti-core"
        ) from e
    except Exception as e:
        logger.error(f"Failed to initialize Graphiti: {e}")
        raise ConnectionError(f"Unable to connect to Neo4j: {e}") from e


async def _create_client(settings, openai_key: str) -> "Graphiti":
    """Create and configure the Graphiti client with instrumented LLM clients."""
    from graphiti_core import Graphiti
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
    
    from core.instrumented_openai import InstrumentedAsyncOpenAI
    from core.langsmith import wrap_openai_client, is_langsmith_enabled
    from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient

    # Create LLM config (Fireworks limit: max_tokens=4096 for non-streaming)
    llm_config = LLMConfig(
        api_key=openai_key,
        model=settings.openai.model,
        base_url=settings.openai.base_url,
        max_tokens=4096,
    )
    
    # Create instrumented LLM client
    llm_client = OpenAIGenericClient(config=llm_config, max_tokens=4096)
    
    # Create instrumented and optionally LangSmith-wrapped client
    llm_openai_client = InstrumentedAsyncOpenAI(
        api_key=openai_key,
        base_url=settings.openai.base_url,
    )
    # Wrap with LangSmith if enabled
    if is_langsmith_enabled():
        llm_openai_client = wrap_openai_client(llm_openai_client, "graphiti_llm")
    llm_client.client = llm_openai_client

    # Create embedder config
    embedder_config = OpenAIEmbedderConfig(
        api_key=openai_key,
        embedding_model=settings.openai.embedding_model,
        base_url=settings.openai.base_url,
        embedding_dim=settings.openai.embedding_dim,
    )
    embedder = OpenAIEmbedder(config=embedder_config)
    
    # Create instrumented embedder client with LangSmith
    embedder_client = InstrumentedAsyncOpenAI(
        api_key=openai_key,
        base_url=settings.openai.base_url,
    )
    if is_langsmith_enabled():
        embedder_client = wrap_openai_client(embedder_client, "graphiti_embedder")
    embedder.client = embedder_client

    # Create cross-encoder config using the same model as LLM
    # The cross-encoder uses logprobs for ranking, which Fireworks AI supports
    cross_encoder_config = LLMConfig(
        api_key=openai_key,
        model=settings.openai.model,  # Use same model as LLM
        base_url=settings.openai.base_url,
    )
    cross_encoder = OpenAIRerankerClient(config=cross_encoder_config)
    
    # Create instrumented cross-encoder client with LangSmith
    cross_encoder_client = InstrumentedAsyncOpenAI(
        api_key=openai_key,
        base_url=settings.openai.base_url,
    )
    if is_langsmith_enabled():
        cross_encoder_client = wrap_openai_client(cross_encoder_client, "graphiti_reranker")
    cross_encoder.client = cross_encoder_client

    return Graphiti(
        uri=settings.neo4j.uri,
        user=settings.neo4j.user,
        password=settings.neo4j.password.get_secret_value(),
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
        store_raw_episode_content=settings.store_raw_content,
        max_coroutines=settings.max_coroutines,
    )


async def _ensure_vector_indices(client: "Graphiti") -> None:
    """
    Ensure required vector indices exist in Neo4j.

    The graphiti-core library may not create vector indices by default,
    so we create them manually if they don't exist.
    """
    settings = get_graphiti_settings()
    embedding_dim = settings.openai.embedding_dim

    logger.info("Checking vector indices...")

    try:
        async with client.driver.session() as session:
            # Check if entity_name_embedding_index exists
            result = await session.run("SHOW INDEXES WHERE name = 'entity_name_embedding_index'")
            indices = await result.data()

            if not indices:
                logger.info("Creating entity_name_embedding_index...")
                await session.run(f"""
                    CREATE VECTOR INDEX entity_name_embedding_index IF NOT EXISTS
                    FOR (e:Entity)
                    ON e.name_embedding
                    OPTIONS {{indexConfig: {{
                        `vector.dimensions`: {embedding_dim},
                        `vector.similarity_function`: 'cosine'
                    }}}}
                """)
                logger.info("✅ entity_name_embedding_index created")
            else:
                logger.debug("entity_name_embedding_index already exists")

    except Exception as e:
        logger.warning(f"Vector index creation had issues: {e}")


async def _build_indices(client: "Graphiti") -> None:
    """Build Neo4j indices and constraints, including vector indices."""
    logger.info("Building Neo4j indices and constraints...")
    try:
        await client.build_indices_and_constraints()
    except Exception as idx_error:
        error_msg = str(idx_error).lower()
        if "equivalentschemarulealreadyexists" in error_msg or "already exists" in error_msg:
            logger.info("Indices already exist, continuing...")
        else:
            logger.warning(f"Index creation had issues: {idx_error}")

    # Ensure vector indices exist (graphiti-core may not create these by default)
    await _ensure_vector_indices(client)


async def get_graphiti_client() -> "Graphiti":
    """
    Get the initialized Graphiti client.

    Event-loop aware: reinitializes if the current loop differs from creation.

    Returns
    -------
    Graphiti
        The Graphiti client instance.
    """
    global _graphiti_client, _graphiti_loop_id

    current_loop_id = _get_current_loop_id()

    if _graphiti_client is not None and _graphiti_loop_id == current_loop_id:
        return _graphiti_client

    return await initialize_graphiti()


async def close_graphiti() -> None:
    """
    Close the Graphiti client connection.

    Call during application shutdown to properly release Neo4j resources.
    """
    global _graphiti_client, _graphiti_loop_id

    if _graphiti_client is not None:
        logger.info("Closing Graphiti connection...")
        try:
            await _graphiti_client.close()
        except Exception as e:
            logger.warning(f"Error closing Graphiti: {e}")
        _graphiti_client = None
        _graphiti_loop_id = None
        logger.info("Graphiti connection closed")
