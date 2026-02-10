"""
Search API

Endpoints for Graphiti-powered knowledge graph search.
This API is designed to be called by the Gate service for document retrieval.

Features:
- Hybrid search (semantic + keyword + graph traversal)
- Semantic-only search (vector similarity)
- Graph-based search (entity relationships)
- User-scoped results (multi-tenant isolation)
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.auth import verify_internal_service
from core.logging import get_logger
from graphrag import (
    get_graphiti_client,
    retrieve_context_for_query,
    search_documents,
    ensure_user_entity,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/search", tags=["Search"])


# =============================================================================
# Request/Response Models
# =============================================================================


class SearchMode(str, Enum):
    """Search strategy modes for knowledge graph queries."""

    hybrid = "hybrid"  # Combined semantic + keyword + graph
    semantic = "semantic"  # Vector similarity only
    keyword = "keyword"  # BM25 keyword only
    graph = "graph"  # Graph traversal only


class DocumentResult(BaseModel):
    """Document search result from knowledge graph."""

    document_id: Optional[str] = Field(None, description="Document UUID from storage")
    filename: str = Field(..., description="Original filename")
    relevance: float = Field(..., ge=0, le=1, description="Relevance score (0-1)")
    matched_entities: list[str] = Field(
        default_factory=list, description="Entities that matched the query"
    )
    reference_time: Optional[str] = Field(None, description="Document reference time if available")


class DocumentSearchResponse(BaseModel):
    """Response model for document search endpoint."""

    query: str = Field(..., description="Original search query")
    user_id: str = Field(..., description="User ID for scoped search")
    count: int = Field(..., ge=0, description="Number of results returned")
    documents: list[DocumentResult] = Field(default_factory=list, description="Matching documents")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class EntityResult(BaseModel):
    """An entity node extracted from documents."""

    uuid: str = Field(..., description="Unique entity identifier")
    name: str = Field(..., description="Entity name", example="John Doe")
    summary: Optional[str] = Field(None, description="AI-generated entity summary")
    labels: list[str] = Field(
        default_factory=list,
        description="Entity type labels",
        example=["Person", "Employee"],
    )


class FactResult(BaseModel):
    """A fact/relationship between entities."""

    uuid: str = Field(..., description="Unique fact identifier")
    fact: str = Field(
        ...,
        description="The factual statement",
        example="John Doe works at Acme Corp",
    )
    source_uuid: Optional[str] = Field(None, description="Source entity UUID")
    target_uuid: Optional[str] = Field(None, description="Target entity UUID")
    created_at: Optional[datetime] = Field(None, description="When the fact was extracted")


class CommunityResult(BaseModel):
    """A community/cluster of related entities."""

    name: str = Field(..., description="Community name", example="Work Colleagues")
    summary: Optional[str] = Field(None, description="AI-generated community summary")


class SearchRequest(BaseModel):
    """Search request body for knowledge graph queries."""

    query: str = Field(
        ...,
        min_length=2,
        max_length=1000,
        description="Search query text",
        example="invoices from last month",
    )
    user_id: str = Field(..., min_length=1, description="User ID for scoped search")
    mode: SearchMode = Field(
        default=SearchMode.hybrid,
        description="Search strategy: hybrid, semantic, keyword, or graph",
    )
    limit: int = Field(default=10, ge=1, le=50, description="Maximum number of results")
    include_communities: bool = Field(
        default=False, description="Include community summaries in results"
    )


class SearchResult(BaseModel):
    """Individual search result with relevance score."""

    document_id: Optional[str] = Field(None, description="Document UUID")
    title: Optional[str] = Field(None, description="Document title")
    content_snippet: Optional[str] = Field(None, description="Relevant content snippet")
    similarity: float = Field(..., ge=0, le=1, description="Similarity score (0-1)")
    match_reason: Optional[str] = Field(None, description="Why this result matched")
    source_type: str = Field(
        default="graph", description="Result source: graph, document, or entity"
    )


class SearchResponse(BaseModel):
    """Response model for knowledge graph search."""

    query: str = Field(..., description="Original search query")
    mode: str = Field(..., description="Search mode used")
    user_id: str = Field(..., description="User ID")
    count: int = Field(..., ge=0, description="Total result count")
    entities: list[EntityResult] = Field(default_factory=list, description="Matched entities")
    facts: list[FactResult] = Field(
        default_factory=list, description="Relevant facts/relationships"
    )
    communities: list[CommunityResult] = Field(
        default_factory=list, description="Related communities"
    )
    context: Optional[str] = Field(None, description="Formatted context string for LLM consumption")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


class ChatSearchRequest(BaseModel):
    """Chat-style search request for conversational retrieval."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="User message/question",
        example="What documents do I have about my car?",
    )
    user_id: str = Field(..., min_length=1, description="User ID")
    conversation_context: Optional[str] = Field(
        None, description="Previous conversation context for continuity"
    )
    limit: int = Field(default=10, ge=1, le=50, description="Maximum results to include")


class ChatSearchResponse(BaseModel):
    """Chat-style search response optimized for RAG."""

    query: str = Field(..., description="Original query/message")
    context: str = Field(..., description="Formatted context for LLM system prompt")
    entity_count: int = Field(..., ge=0, description="Number of entities in context")
    fact_count: int = Field(..., ge=0, description="Number of facts in context")
    processing_time_ms: float = Field(..., description="Processing time in milliseconds")


# =============================================================================
# Search Endpoints
# =============================================================================


@router.post(
    "/documents",
    response_model=DocumentSearchResponse,
    summary="Search documents",
    description="Search for documents using Graphiti knowledge graph. Finds documents (Episodes) that are relevant to the query by matching entities and traversing the graph.",
    responses={
        200: {"description": "Document search results"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Internal server error"},
    },
)
async def search_docs(
    request: SearchRequest,
    _: None = Depends(verify_internal_service),
) -> DocumentSearchResponse:
    """
    Search for documents using Graphiti knowledge graph.

    Finds documents (Episodes) that are relevant to the query by matching
    entities and traversing the graph.

    **Authentication**: Requires internal service API key.
    """
    import time

    start_time = time.time()

    logger.info(f"Document search request: user={request.user_id}, query={request.query[:50]}...")

    try:
        documents = await search_documents(
            user_id=request.user_id,
            query=request.query,
            limit=request.limit,
        )

        processing_time = (time.time() - start_time) * 1000

        return DocumentSearchResponse(
            query=request.query,
            user_id=request.user_id,
            count=len(documents),
            documents=[DocumentResult(**doc) for doc in documents],
            processing_time_ms=round(processing_time, 2),
        )

    except Exception as e:
        logger.error(f"Document search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Document search failed: {str(e)}")


@router.post(
    "/",
    response_model=SearchResponse,
    summary="Knowledge graph search",
    description="""
Perform a knowledge graph search using Graphiti.

**Search Modes**:
- `hybrid`: Combines semantic similarity, BM25 keyword matching, and graph traversal (recommended)
- `semantic`: Pure vector similarity search
- `keyword`: BM25 keyword matching only
- `graph`: Graph traversal from user's entity node

Returns entities, facts, and optionally community summaries.
    """,
    responses={
        200: {"description": "Search results with entities and facts"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Search failed"},
    },
)
async def search(
    request: SearchRequest,
    _: None = Depends(verify_internal_service),
) -> SearchResponse:
    """
    Perform a knowledge graph search.

    This endpoint searches the Graphiti knowledge graph using the specified
    mode and returns entities, facts, and optionally community summaries.

    **Authentication**: Requires internal service API key.

    **Search Modes**:
    - `hybrid`: Combines semantic similarity, BM25 keyword matching, and graph traversal (recommended)
    - `semantic`: Pure vector similarity search
    - `keyword`: BM25 keyword matching only
    - `graph`: Graph traversal from user's entity node
    """
    import time

    start_time = time.time()

    logger.info(
        f"Search request: mode={request.mode}, user={request.user_id}, query={request.query[:50]}..."
    )

    try:
        from graphiti_core.search.search_config import (
            SearchConfig,
            EdgeSearchConfig,
            EdgeSearchMethod,
            EdgeReranker,
            NodeSearchConfig,
            NodeSearchMethod,
            NodeReranker,
            CommunitySearchConfig,
            CommunitySearchMethod,
            CommunityReranker,
        )

        client = await get_graphiti_client()

        # Find user entity for center-based search
        user_entity = await ensure_user_entity(client, request.user_id)
        center_node_uuid = user_entity.uuid if user_entity else None

        # Configure search based on mode
        search_config = _build_search_config(
            mode=request.mode,
            limit=request.limit,
            include_communities=request.include_communities,
            has_center_node=center_node_uuid is not None,
        )

        # Execute search
        results = await client.search_(
            query=request.query,
            config=search_config,
            group_ids=[request.user_id],
            center_node_uuid=center_node_uuid,
            bfs_origin_node_uuids=[center_node_uuid]
            if center_node_uuid and request.mode in [SearchMode.hybrid, SearchMode.graph]
            else None,
        )

        # Format results
        entities = [
            EntityResult(
                uuid=node.uuid,
                name=node.name,
                summary=node.summary,
                labels=getattr(node, "labels", []),
            )
            for node in results.nodes
        ]

        facts = [
            FactResult(
                uuid=edge.uuid,
                fact=edge.fact,
                source_uuid=edge.source_node_uuid,
                target_uuid=edge.target_node_uuid,
                created_at=getattr(edge, "created_at", None),
            )
            for edge in results.edges
        ]

        communities = []
        if request.include_communities and results.communities:
            communities = [
                CommunityResult(
                    name=c.name,
                    summary=c.summary,
                )
                for c in results.communities
            ]

        # Build formatted context for LLM
        context = _format_context(entities, facts, communities)

        processing_time = (time.time() - start_time) * 1000

        logger.info(
            f"Search complete: {len(entities)} entities, {len(facts)} facts in {processing_time:.1f}ms"
        )

        return SearchResponse(
            query=request.query,
            mode=request.mode.value,
            user_id=request.user_id,
            count=len(entities) + len(facts),
            entities=entities,
            facts=facts,
            communities=communities,
            context=context,
            processing_time_ms=round(processing_time, 2),
        )

    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post(
    "/chat",
    response_model=ChatSearchResponse,
    summary="Chat-style RAG search",
    description="Chat-style search optimized for conversational AI. Returns a formatted context string suitable for injecting into an LLM's system prompt for RAG (Retrieval Augmented Generation).",
    responses={
        200: {"description": "Formatted context for LLM"},
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Search failed"},
    },
)
async def chat_search(
    request: ChatSearchRequest,
    _: None = Depends(verify_internal_service),
) -> ChatSearchResponse:
    """
    Chat-style search optimized for conversational AI.

    Returns a formatted context string suitable for injecting into
    an LLM's system prompt for RAG (Retrieval Augmented Generation).

    **Authentication**: Requires internal service API key.
    """
    import time

    start_time = time.time()

    logger.info(f"Chat search: user={request.user_id}, message={request.message[:50]}...")

    try:
        # Use the high-level retrieve_context_for_query function
        context = await retrieve_context_for_query(
            user_id=request.user_id,
            query=request.message,
            num_results=request.limit,
            include_communities=True,
        )

        # Get counts for response
        entity_count = context.count("**") // 2  # Rough estimate from formatting
        fact_count = context.count(". [Source:") + context.count("1. ") + context.count("2. ")

        processing_time = (time.time() - start_time) * 1000

        logger.info(f"Chat search complete in {processing_time:.1f}ms")

        return ChatSearchResponse(
            query=request.message,
            context=context,
            entity_count=entity_count,
            fact_count=fact_count,
            processing_time_ms=round(processing_time, 2),
        )

    except Exception as e:
        logger.error(f"Chat search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat search failed: {str(e)}")


@router.get(
    "/entities/{user_id}",
    summary="List user entities",
    description="List all entities associated with a user's documents. Useful for browsing the knowledge graph and understanding what has been extracted.",
    responses={
        200: {
            "description": "List of user's entities",
            "content": {
                "application/json": {
                    "example": {
                        "count": 25,
                        "entities": [
                            {
                                "uuid": "abc123",
                                "name": "John Doe",
                                "summary": "A person mentioned in documents",
                            }
                        ],
                    }
                }
            },
        },
        401: {"description": "Invalid or missing API key"},
        500: {"description": "Failed to retrieve entities"},
    },
)
async def list_user_entities(
    user_id: str,
    limit: int = Query(
        default=50, ge=1, le=200, description="Maximum number of entities to return"
    ),
    _: None = Depends(verify_internal_service),
) -> dict:
    """
    List all entities associated with a user's documents.

    Useful for browsing the knowledge graph and understanding
    what has been extracted from the user's documents.

    **Authentication**: Requires internal service API key.
    """
    try:
        from graphiti_core.search.search_config import (
            SearchConfig,
            NodeSearchConfig,
            NodeSearchMethod,
        )

        client = await get_graphiti_client()

        # Search for all entities in user's partition
        search_config = SearchConfig(
            node_config=NodeSearchConfig(
                search_methods=[NodeSearchMethod.bm25],
            ),
            limit=limit,
        )

        # Use a broad query to get all entities
        results = await client.search_(
            query="*",  # Wildcard-like query
            config=search_config,
            group_ids=[user_id],
        )

        entities = [
            {
                "uuid": node.uuid,
                "name": node.name,
                "summary": node.summary,
            }
            for node in results.nodes
        ]

        return {
            "user_id": user_id,
            "count": len(entities),
            "entities": entities,
        }

    except Exception as e:
        logger.error(f"List entities failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list entities: {str(e)}")


# =============================================================================
# Helper Functions
# =============================================================================


def _build_search_config(
    mode: SearchMode,
    limit: int,
    include_communities: bool,
    has_center_node: bool,
):
    """Build Graphiti SearchConfig based on mode."""
    from graphiti_core.search.search_config import (
        SearchConfig,
        EdgeSearchConfig,
        EdgeSearchMethod,
        EdgeReranker,
        NodeSearchConfig,
        NodeSearchMethod,
        NodeReranker,
        CommunitySearchConfig,
        CommunitySearchMethod,
        CommunityReranker,
    )

    # Define search methods based on mode
    if mode == SearchMode.hybrid:
        edge_methods = [
            EdgeSearchMethod.bm25,
            EdgeSearchMethod.cosine_similarity,
            EdgeSearchMethod.bfs,
        ]
        node_methods = [
            NodeSearchMethod.bm25,
            NodeSearchMethod.cosine_similarity,
            NodeSearchMethod.bfs,
        ]
    elif mode == SearchMode.semantic:
        edge_methods = [EdgeSearchMethod.cosine_similarity]
        node_methods = [NodeSearchMethod.cosine_similarity]
    elif mode == SearchMode.keyword:
        edge_methods = [EdgeSearchMethod.bm25]
        node_methods = [NodeSearchMethod.bm25]
    elif mode == SearchMode.graph:
        edge_methods = [EdgeSearchMethod.bfs]
        node_methods = [NodeSearchMethod.bfs]
    else:
        edge_methods = [EdgeSearchMethod.cosine_similarity]
        node_methods = [NodeSearchMethod.cosine_similarity]

    # Select reranker based on whether we have a center node
    edge_reranker = EdgeReranker.node_distance if has_center_node else EdgeReranker.rrf
    node_reranker = NodeReranker.node_distance if has_center_node else NodeReranker.rrf

    config = SearchConfig(
        edge_config=EdgeSearchConfig(
            search_methods=edge_methods,
            reranker=edge_reranker,
        ),
        node_config=NodeSearchConfig(
            search_methods=node_methods,
            reranker=node_reranker,
        ),
        limit=limit,
    )

    # Add community search if requested
    if include_communities:
        config.community_config = CommunitySearchConfig(
            search_methods=[
                CommunitySearchMethod.bm25,
                CommunitySearchMethod.cosine_similarity,
            ],
            reranker=CommunityReranker.rrf,
        )

    return config


def _format_context(
    entities: list[EntityResult],
    facts: list[FactResult],
    communities: list[CommunityResult],
) -> str:
    """Format search results into a context string for LLM consumption."""
    sections = []

    if facts:
        fact_lines = ["## Relevant Facts"]
        for i, fact in enumerate(facts, 1):
            source_info = f" [Source: {fact.source_uuid[:8]}...]" if fact.source_uuid else ""
            fact_lines.append(f"{i}. {fact.fact}{source_info}")
        sections.append("\n".join(fact_lines))

    if entities:
        entity_lines = ["## Relevant Entities"]
        for entity in entities:
            summary = entity.summary or "No summary available"
            entity_lines.append(f"- **{entity.name}**: {summary}")
        sections.append("\n".join(entity_lines))

    if communities:
        community_lines = ["## Topic Summaries"]
        for community in communities:
            community_lines.append(f"- **{community.name}**: {community.summary or 'No summary'}")
        sections.append("\n".join(community_lines))

    if not sections:
        return "No relevant information found in your documents."

    return "\n\n".join(sections)
