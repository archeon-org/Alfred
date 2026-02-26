import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from application.api.errors import ApiServiceError
from core.logging import get_logger
from graphrag import (
    ensure_user_entity,
    get_graphiti_client,
    retrieve_context_for_query,
    search_documents,
)

logger = get_logger(__name__)


class SearchMode(StrEnum):
    hybrid = "hybrid"
    semantic = "semantic"
    keyword = "keyword"
    graph = "graph"


@dataclass(frozen=True, slots=True)
class DocumentSearchResult:
    query: str
    user_id: str
    documents: list[dict[str, Any]]
    processing_time_ms: float


@dataclass(frozen=True, slots=True)
class SearchGraphResult:
    query: str
    mode: SearchMode
    user_id: str
    entities: list[dict[str, Any]]
    facts: list[dict[str, Any]]
    communities: list[dict[str, Any]]
    context: str
    processing_time_ms: float


@dataclass(frozen=True, slots=True)
class ChatSearchResult:
    query: str
    context: str
    entity_count: int
    fact_count: int
    processing_time_ms: float


class SearchService:
    async def execute_document_search(
        self,
        user_id: str,
        query: str,
        limit: int,
    ) -> DocumentSearchResult:
        started_at = time.perf_counter()
        logger.info(f"Document search request: user={user_id}, query={query[:50]}...")
        try:
            documents = await self.search_documents(user_id=user_id, query=query, limit=limit)
        except Exception as error:
            logger.error(f"Document search failed: {error}", exc_info=True)
            raise ApiServiceError(f"Document search failed: {error}") from error
        return DocumentSearchResult(
            query=query,
            user_id=user_id,
            documents=documents,
            processing_time_ms=self._elapsed_ms(started_at),
        )

    async def execute_graph_search(
        self,
        user_id: str,
        query: str,
        mode: SearchMode,
        limit: int,
        include_communities: bool,
    ) -> SearchGraphResult:
        started_at = time.perf_counter()
        logger.info(f"Search request: mode={mode}, user={user_id}, query={query[:50]}...")
        try:
            entities, facts, communities, context = await self.search_graph(
                user_id=user_id,
                query=query,
                mode=mode,
                limit=limit,
                include_communities=include_communities,
            )
        except Exception as error:
            logger.error(f"Search failed: {error}", exc_info=True)
            raise ApiServiceError(f"Search failed: {error}") from error
        duration_ms = self._elapsed_ms(started_at)
        logger.info(
            "Search complete",
            entity_count=len(entities),
            fact_count=len(facts),
            duration_ms=duration_ms,
        )
        return SearchGraphResult(
            query=query,
            mode=mode,
            user_id=user_id,
            entities=entities,
            facts=facts,
            communities=communities,
            context=context,
            processing_time_ms=duration_ms,
        )

    async def execute_chat_search(
        self,
        user_id: str,
        query: str,
        limit: int,
    ) -> ChatSearchResult:
        started_at = time.perf_counter()
        logger.info(f"Chat search: user={user_id}, message={query[:50]}...")
        try:
            context, entity_count, fact_count = await self.chat_search(
                user_id=user_id,
                query=query,
                limit=limit,
            )
        except Exception as error:
            logger.error(f"Chat search failed: {error}", exc_info=True)
            raise ApiServiceError(f"Chat search failed: {error}") from error
        return ChatSearchResult(
            query=query,
            context=context,
            entity_count=entity_count,
            fact_count=fact_count,
            processing_time_ms=self._elapsed_ms(started_at),
        )

    async def execute_list_user_entities(
        self,
        user_id: str,
        limit: int,
    ) -> list[dict[str, str | None]]:
        try:
            return await self.list_user_entities(user_id=user_id, limit=limit)
        except Exception as error:
            logger.error(f"List entities failed: {error}", exc_info=True)
            raise ApiServiceError(f"Failed to list entities: {error}") from error

    async def search_documents(
        self,
        user_id: str,
        query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        documents = await search_documents(user_id=user_id, query=query, limit=limit)
        return [
            {
                "document_id": document.get("document_id"),
                "filename": document.get("filename", ""),
                "relevance": document.get("relevance", 0.0),
                "matched_entities": document.get("matched_entities", []),
                "reference_time": document.get("reference_time") or document.get("valid_at"),
            }
            for document in documents
        ]

    async def search_graph(
        self,
        user_id: str,
        query: str,
        mode: SearchMode,
        limit: int,
        include_communities: bool,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], str]:
        client = await get_graphiti_client()
        user_entity = await ensure_user_entity(client, user_id)
        center_node_uuid = user_entity.uuid if user_entity else None
        search_config = self._build_search_config(
            mode=mode,
            limit=limit,
            include_communities=include_communities,
            has_center_node=center_node_uuid is not None,
        )
        results = await client.search_(
            query=query,
            config=search_config,
            group_ids=[user_id],
            center_node_uuid=center_node_uuid,
            bfs_origin_node_uuids=[center_node_uuid]
            if center_node_uuid and mode in {SearchMode.hybrid, SearchMode.graph}
            else None,
        )
        entities = [
            {
                "uuid": node.uuid,
                "name": node.name,
                "summary": node.summary,
                "labels": getattr(node, "labels", []),
            }
            for node in results.nodes
        ]
        facts = [
            {
                "uuid": edge.uuid,
                "fact": edge.fact,
                "source_uuid": edge.source_node_uuid,
                "target_uuid": edge.target_node_uuid,
                "created_at": getattr(edge, "created_at", None),
            }
            for edge in results.edges
        ]
        communities: list[dict[str, Any]] = []
        if include_communities and results.communities:
            communities = [
                {"name": community.name, "summary": community.summary}
                for community in results.communities
            ]
        context = self._format_context(entities, facts, communities)
        return entities, facts, communities, context

    async def chat_search(
        self,
        user_id: str,
        query: str,
        limit: int,
    ) -> tuple[str, int, int]:
        context = await retrieve_context_for_query(
            user_id=user_id,
            query=query,
            num_results=limit,
            include_communities=True,
        )
        entity_count = context.count("**") // 2
        fact_count = context.count(". [Source:") + context.count("1. ") + context.count("2. ")
        return context, entity_count, fact_count

    async def list_user_entities(
        self,
        user_id: str,
        limit: int,
    ) -> list[dict[str, str | None]]:
        from graphiti_core.search.search_config import (
            NodeSearchConfig,
            NodeSearchMethod,
            SearchConfig,
        )

        client = await get_graphiti_client()
        search_config = SearchConfig(
            node_config=NodeSearchConfig(search_methods=[NodeSearchMethod.bm25]),
            limit=limit,
        )
        results = await client.search_(query="*", config=search_config, group_ids=[user_id])
        return [
            {"uuid": node.uuid, "name": node.name, "summary": node.summary}
            for node in results.nodes
        ]

    def _build_search_config(
        self,
        mode: SearchMode,
        limit: int,
        include_communities: bool,
        has_center_node: bool,
    ) -> Any:
        from graphiti_core.search.search_config import (
            CommunityReranker,
            CommunitySearchConfig,
            CommunitySearchMethod,
            EdgeReranker,
            EdgeSearchConfig,
            EdgeSearchMethod,
            NodeReranker,
            NodeSearchConfig,
            NodeSearchMethod,
            SearchConfig,
        )

        edge_methods_map = {
            SearchMode.hybrid: [
                EdgeSearchMethod.bm25,
                EdgeSearchMethod.cosine_similarity,
                EdgeSearchMethod.bfs,
            ],
            SearchMode.semantic: [EdgeSearchMethod.cosine_similarity],
            SearchMode.keyword: [EdgeSearchMethod.bm25],
            SearchMode.graph: [EdgeSearchMethod.bfs],
        }
        node_methods_map = {
            SearchMode.hybrid: [
                NodeSearchMethod.bm25,
                NodeSearchMethod.cosine_similarity,
                NodeSearchMethod.bfs,
            ],
            SearchMode.semantic: [NodeSearchMethod.cosine_similarity],
            SearchMode.keyword: [NodeSearchMethod.bm25],
            SearchMode.graph: [NodeSearchMethod.bfs],
        }

        edge_methods = edge_methods_map.get(mode, [EdgeSearchMethod.cosine_similarity])
        node_methods = node_methods_map.get(mode, [NodeSearchMethod.cosine_similarity])
        edge_reranker = EdgeReranker.node_distance if has_center_node else EdgeReranker.rrf
        node_reranker = NodeReranker.node_distance if has_center_node else NodeReranker.rrf

        config = SearchConfig(
            edge_config=EdgeSearchConfig(search_methods=edge_methods, reranker=edge_reranker),
            node_config=NodeSearchConfig(search_methods=node_methods, reranker=node_reranker),
            limit=limit,
        )
        if include_communities:
            config.community_config = CommunitySearchConfig(
                search_methods=[
                    CommunitySearchMethod.bm25,
                    CommunitySearchMethod.cosine_similarity,
                ],
                reranker=CommunityReranker.rrf,
            )
        return config

    @staticmethod
    def _format_context(
        entities: list[dict[str, Any]],
        facts: list[dict[str, Any]],
        communities: list[dict[str, Any]],
    ) -> str:
        sections: list[str] = []
        if facts:
            fact_lines = ["## Relevant Facts"]
            for index, fact in enumerate(facts, start=1):
                source_uuid = fact.get("source_uuid")
                source_info = f" [Source: {source_uuid[:8]}...]" if source_uuid else ""
                fact_lines.append(f"{index}. {fact['fact']}{source_info}")
            sections.append("\n".join(fact_lines))
        if entities:
            entity_lines = ["## Relevant Entities"]
            for entity in entities:
                summary = entity.get("summary") or "No summary available"
                entity_lines.append(f"- **{entity['name']}**: {summary}")
            sections.append("\n".join(entity_lines))
        if communities:
            community_lines = ["## Topic Summaries"]
            for community in communities:
                summary = community.get("summary") or "No summary"
                community_lines.append(f"- **{community['name']}**: {summary}")
            sections.append("\n".join(community_lines))
        if not sections:
            return "No relevant information found in your documents."
        return "\n\n".join(sections)

    @staticmethod
    def _elapsed_ms(started_at: float) -> float:
        return round((time.perf_counter() - started_at) * 1000, 2)


_search_service: SearchService | None = None


def get_search_service() -> SearchService:
    global _search_service
    if _search_service is None:
        _search_service = SearchService()
    return _search_service
