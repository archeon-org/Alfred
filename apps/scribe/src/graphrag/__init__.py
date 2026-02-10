"""
Graphiti GraphRAG Module

Provides a Graphiti-powered "Second Brain" agent for:
- Knowledge graph construction from documents
- Personalized semantic search and retrieval
- User-centric context aggregation for LLM prompts

Refactored into focused modules:
- client.py: Client lifecycle management
- ingestion.py: Document ingestion
- search.py: Search and retrieval
- config.py: Configuration settings
- entity_types.py: Custom entity and relationship types
"""

from graphrag.config import get_graphiti_settings, GraphitiSettings
from graphrag.client import (
    initialize_graphiti,
    get_graphiti_client,
    close_graphiti,
)
from graphrag.ingestion import (
    ingest_document_episode,
    ingest_document_bulk,
    ensure_user_entity,
    delete_document_from_graph,
)
from graphrag.search import (
    retrieve_context_for_query,
    search_documents,
    format_search_results,
)
from graphrag.entity_types import (
    get_entity_types,
    get_edge_types,
    get_edge_type_map,
    ENTITY_TYPES,
    EDGE_TYPES,
    EDGE_TYPE_MAP,
)

__all__ = [
    # Configuration
    "get_graphiti_settings",
    "GraphitiSettings",
    # Client lifecycle
    "initialize_graphiti",
    "get_graphiti_client",
    "close_graphiti",
    # Ingestion
    "ingest_document_episode",
    "ingest_document_bulk",
    "ensure_user_entity",
    "delete_document_from_graph",
    # Search
    "retrieve_context_for_query",
    "search_documents",
    "format_search_results",
    # Entity Types
    "get_entity_types",
    "get_edge_types",
    "get_edge_type_map",
    "ENTITY_TYPES",
    "EDGE_TYPES",
    "EDGE_TYPE_MAP",
]
