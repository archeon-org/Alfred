from fastapi import APIRouter, Depends, Query

from api.auth import verify_internal_service
from api.presenters.search import (
    present_chat_search,
    present_document_search,
    present_entities,
    present_graph_search,
)
from api.schemas.search import (
    ChatSearchRequest,
    ChatSearchResponse,
    DocumentSearchResponse,
    SearchRequest,
    SearchResponse,
)
from application.api.search_service import get_search_service

router = APIRouter(prefix="/search", tags=["Search"])


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
    result = await get_search_service().execute_document_search(
        user_id=request.user_id,
        query=request.query,
        limit=request.limit,
    )
    return present_document_search(result)


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
    result = await get_search_service().execute_graph_search(
        user_id=request.user_id,
        query=request.query,
        mode=request.mode,
        limit=request.limit,
        include_communities=request.include_communities,
    )
    return present_graph_search(result)


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
    result = await get_search_service().execute_chat_search(
        user_id=request.user_id,
        query=request.message,
        limit=request.limit,
    )
    return present_chat_search(result)


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
        default=50,
        ge=1,
        le=200,
        description="Maximum number of entities to return",
    ),
    _: None = Depends(verify_internal_service),
) -> dict[str, object]:
    entities = await get_search_service().execute_list_user_entities(user_id=user_id, limit=limit)
    return present_entities(user_id, entities)
