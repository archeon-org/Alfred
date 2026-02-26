from typing import Any

from api.schemas.search import (
    ChatSearchResponse,
    CommunityResult,
    DocumentResult,
    DocumentSearchResponse,
    EntityResult,
    FactResult,
    SearchResponse,
)
from application.api.search_service import (
    ChatSearchResult,
    DocumentSearchResult,
    SearchGraphResult,
)


def present_document_search(result: DocumentSearchResult) -> DocumentSearchResponse:
    return DocumentSearchResponse(
        query=result.query,
        user_id=result.user_id,
        count=len(result.documents),
        documents=[DocumentResult(**document) for document in result.documents],
        processing_time_ms=result.processing_time_ms,
    )


def present_graph_search(result: SearchGraphResult) -> SearchResponse:
    entities = [EntityResult(**entity) for entity in result.entities]
    facts = [FactResult(**fact) for fact in result.facts]
    communities = [CommunityResult(**community) for community in result.communities]
    return SearchResponse(
        query=result.query,
        mode=result.mode.value,
        user_id=result.user_id,
        count=len(entities) + len(facts),
        entities=entities,
        facts=facts,
        communities=communities,
        context=result.context,
        processing_time_ms=result.processing_time_ms,
    )


def present_chat_search(result: ChatSearchResult) -> ChatSearchResponse:
    return ChatSearchResponse(
        query=result.query,
        context=result.context,
        entity_count=result.entity_count,
        fact_count=result.fact_count,
        processing_time_ms=result.processing_time_ms,
    )


def present_entities(user_id: str, entities: list[dict[str, str | None]]) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "count": len(entities),
        "entities": entities,
    }
