"""
Graphiti Search and Retrieval

Single Responsibility: Search the knowledge graph and retrieve context.
- Multi-strategy hybrid search (semantic + keyword + graph traversal)
- Episode content search for precise document retrieval
- Cross-encoder reranking for high accuracy (using Fireworks AI)
- Document search via entity similarity
- Result formatting for LLM consumption
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from graphrag.client import get_graphiti_client
from graphrag.config import get_graphiti_settings
from graphrag.ingestion import ensure_user_entity

if TYPE_CHECKING:
    from graphiti_core.search.search_config import SearchResults

logger = logging.getLogger(__name__)


async def retrieve_context_for_query(
    user_id: str,
    query: str,
    num_results: int = 15,
    include_communities: bool = False,
) -> str:
    """
    Retrieve relevant facts and context for a user query using multi-strategy search.

    Uses a comprehensive approach:
    1. Cross-encoder reranked hybrid search (most accurate, uses LLM logprobs)
    2. Direct episode content search (finds raw document text)
    3. Entity-based graph traversal (finds related concepts)

    Parameters
    ----------
    user_id : str
        The user's unique identifier.
    query : str
        The natural language query to search for.
    num_results : int, optional
        Maximum number of results per strategy. Defaults to 15.
    include_communities : bool, optional
        Whether to include community summaries. Defaults to False.

    Returns
    -------
    str
        Formatted context string suitable for LLM prompts.
    """
    from graphiti_core.search.search_config import SearchResults

    client = await get_graphiti_client()

    logger.info(
        f"Retrieving context for user {user_id}: {query[:50]}...",
        extra={"user_id": user_id, "query": query},
    )

    try:
        # Find user entity for center-based search
        user_entity = await ensure_user_entity(client, user_id)
        center_node_uuid = user_entity.uuid if user_entity else None

        # Strategy 1: Cross-encoder reranked hybrid search (most accurate)
        main_results = await _cross_encoder_search(
            client=client,
            query=query,
            user_id=user_id,
            limit=num_results,
            center_node_uuid=center_node_uuid,
            include_communities=include_communities,
        )

        # Strategy 2: Direct episode content search
        episode_results = await _search_episode_content(
            client=client,
            query=query,
            user_id=user_id,
            limit=num_results,
        )

        # Combine results
        combined_results = _merge_search_results(main_results, episode_results)

        # Extract episode content for direct inclusion
        episode_contents = []
        for ep in combined_results.episodes:
            if ep.content and len(ep.content.strip()) > 0:
                episode_contents.append(ep.content)

        # Format for LLM
        context = format_search_results(
            results=combined_results,
            include_communities=include_communities,
            episode_contents=episode_contents if episode_contents else None,
        )

        logger.info(
            f"Retrieved {len(combined_results.edges)} facts, "
            f"{len(combined_results.nodes)} entities, "
            f"{len(combined_results.episodes)} episodes",
            extra={
                "edge_count": len(combined_results.edges),
                "node_count": len(combined_results.nodes),
                "episode_count": len(combined_results.episodes),
                "community_count": len(combined_results.communities),
            },
        )

        return context

    except Exception as e:
        logger.error(f"Failed to retrieve context: {e}", exc_info=True)
        return f"[Error retrieving context: {e}]"


async def _cross_encoder_search(
    client,
    query: str,
    user_id: str,
    limit: int,
    center_node_uuid: str | None,
    include_communities: bool,
) -> "SearchResults":
    """
    Perform cross-encoder reranked hybrid search.

    Cross-encoder reranking provides the most accurate results by
    comparing query-result pairs directly through the LLM model.
    Uses the same model configured for the main LLM client.
    """
    from graphiti_core.search.search_config import (
        SearchConfig,
        EdgeSearchConfig,
        EdgeSearchMethod,
        EdgeReranker,
        NodeSearchConfig,
        NodeSearchMethod,
        NodeReranker,
        EpisodeSearchConfig,
        EpisodeSearchMethod,
        EpisodeReranker,
        CommunitySearchConfig,
        CommunitySearchMethod,
        CommunityReranker,
    )

    # Use cross-encoder reranking for highest accuracy
    config = SearchConfig(
        edge_config=EdgeSearchConfig(
            search_methods=[
                EdgeSearchMethod.bm25,
                EdgeSearchMethod.cosine_similarity,
                EdgeSearchMethod.bfs,
            ],
            reranker=EdgeReranker.cross_encoder,
        ),
        node_config=NodeSearchConfig(
            search_methods=[
                NodeSearchMethod.bm25,
                NodeSearchMethod.cosine_similarity,
                NodeSearchMethod.bfs,
            ],
            reranker=NodeReranker.cross_encoder,
        ),
        episode_config=EpisodeSearchConfig(
            search_methods=[EpisodeSearchMethod.bm25],
            reranker=EpisodeReranker.cross_encoder,
        ),
        limit=limit,
    )

    if include_communities:
        config.community_config = CommunitySearchConfig(
            search_methods=[
                CommunitySearchMethod.bm25,
                CommunitySearchMethod.cosine_similarity,
            ],
            reranker=CommunityReranker.cross_encoder,
        )

    return await client.search_(
        query=query,
        config=config,
        group_ids=[user_id],
        center_node_uuid=center_node_uuid,
        bfs_origin_node_uuids=[center_node_uuid] if center_node_uuid else None,
    )


async def _search_episode_content(
    client,
    query: str,
    user_id: str,
    limit: int,
) -> "SearchResults":
    """
    Search episode content directly using vector similarity.

    This finds relevant document chunks by their content,
    which is essential for precise information retrieval.
    """
    from graphiti_core.search.search_config import SearchResults
    from graphiti_core.nodes import EpisodicNode

    try:
        # Generate query embedding
        query_embedding = await client.embedder.create(query)

        # Search episodes by content similarity
        # Note: Graphiti stores episode content as 'content' field
        cypher = """
        MATCH (episode:Episodic)
        WHERE episode.group_id = $group_id
        AND episode.content IS NOT NULL
        AND episode.content <> ''
        
        // Full-text search on episode content
        WITH episode,
             CASE 
                 WHEN toLower(episode.content) CONTAINS toLower($query) THEN 1.0
                 WHEN toLower(episode.name) CONTAINS toLower($query) THEN 0.8
                 ELSE 0.0
             END AS text_score
        
        WHERE text_score > 0
        
        RETURN episode.uuid AS uuid,
               episode.name AS name,
               episode.content AS content,
               episode.source_description AS source_description,
               episode.valid_at AS valid_at,
               text_score
        ORDER BY text_score DESC
        LIMIT $limit
        """

        result = await client.driver.execute_query(
            cypher,
            group_id=user_id,
            query=query,
            limit=limit,
        )

        episodes = []
        for record in result.records:
            try:
                episode = EpisodicNode(
                    uuid=record["uuid"],
                    name=record["name"],
                    content=record["content"] or "",
                    source_description=record["source_description"] or "",
                    valid_at=record["valid_at"],
                    group_id=user_id,
                    labels=[],
                )
                episodes.append(episode)
            except Exception as e:
                logger.warning(f"Failed to parse episode: {e}")

        return SearchResults(episodes=episodes)

    except Exception as e:
        logger.warning(f"Episode content search failed: {e}")
        return SearchResults()


def _merge_search_results(
    *results_list: "SearchResults",
) -> "SearchResults":
    """Merge multiple SearchResults, deduplicating by UUID."""
    from graphiti_core.search.search_config import SearchResults

    merged = SearchResults()

    seen_edge_uuids = set()
    seen_node_uuids = set()
    seen_episode_uuids = set()
    seen_community_uuids = set()

    for results in results_list:
        if results is None:
            continue

        for edge in results.edges:
            if edge.uuid not in seen_edge_uuids:
                merged.edges.append(edge)
                seen_edge_uuids.add(edge.uuid)

        for node in results.nodes:
            if node.uuid not in seen_node_uuids:
                merged.nodes.append(node)
                seen_node_uuids.add(node.uuid)

        for episode in results.episodes:
            if episode.uuid not in seen_episode_uuids:
                merged.episodes.append(episode)
                seen_episode_uuids.add(episode.uuid)

        for community in results.communities:
            if community.uuid not in seen_community_uuids:
                merged.communities.append(community)
                seen_community_uuids.add(community.uuid)

    return merged


async def search_documents(
    user_id: str,
    query: str,
    limit: int = 10,
) -> list[dict]:
    """
    Search for documents (Episodic nodes) using multiple strategies.

    Strategy:
    1. Semantic search on episode content directly
    2. Find entities matching the query and their related episodes
    3. Full-text search on episode descriptions
    4. Combine, deduplicate, and NORMALIZE scores to 0-1 range

    Parameters
    ----------
    user_id : str
        The user ID to scope the search.
    query : str
        The search query.
    limit : int
        Max number of documents to return.

    Returns
    -------
    list[dict]
        Document results with: document_id, filename, relevance (0-1), matched_entities, valid_at

    Note
    ----
    All relevance scores are normalized to 0-1 range before returning.
    The normalization uses the max score in the result set to preserve ranking.
    """
    client = await get_graphiti_client()
    documents = []
    seen_uuids = set()

    # Generate query embedding for semantic search
    query_embedding = await client.embedder.create(query)

    # Strategy 1: Direct semantic search on episode content
    try:
        semantic_cypher = """
        CALL db.index.vector.queryNodes('episode_content_embedding', $limit, $embedding)
        YIELD node AS episode, score
        WHERE episode.group_id = $group_id
        RETURN episode.uuid AS uuid, 
               episode.name AS name, 
               episode.source_description AS source_description, 
               episode.valid_at AS valid_at,
               episode.content AS content,
               score AS relevance,
               [] AS matched_entities
        ORDER BY score DESC
        """

        semantic_results = await client.driver.execute_query(
            semantic_cypher,
            embedding=query_embedding,
            group_id=user_id,
            limit=limit,
        )

        for record in semantic_results.records:
            if record["uuid"] not in seen_uuids:
                seen_uuids.add(record["uuid"])
                doc_id = _parse_document_id(record["source_description"])
                documents.append(
                    {
                        "document_id": doc_id,
                        "filename": record["name"],
                        "relevance": float(record["relevance"]),
                        "matched_entities": [],
                        "valid_at": record["valid_at"].isoformat()
                        if record.get("valid_at")
                        else None,
                        "content_preview": (record["content"] or "")[:200]
                        if record.get("content")
                        else None,
                    }
                )
    except Exception as e:
        logger.warning(f"Semantic episode search failed (index may not exist): {e}")

    # Strategy 2: Entity-based search (find episodes via related entities)
    try:
        entity_cypher = """
        CALL db.index.vector.queryNodes('entity_name_embedding_index', 50, $embedding)
        YIELD node AS entity, score AS entity_score
        WHERE entity.group_id = $group_id
        
        MATCH (episode:Episodic)-[:MENTIONS]->(entity)
        WHERE episode.group_id = $group_id
        
        WITH episode, sum(entity_score) AS relevance, collect(entity.name) AS matched_entities
        
        RETURN episode.uuid AS uuid, 
               episode.name AS name, 
               episode.source_description AS source_description, 
               episode.valid_at AS valid_at,
               episode.content AS content,
               relevance,
               matched_entities
        ORDER BY relevance DESC
        LIMIT $limit
        """

        entity_results = await client.driver.execute_query(
            entity_cypher,
            embedding=query_embedding,
            group_id=user_id,
            limit=limit,
        )

        for record in entity_results.records:
            if record["uuid"] not in seen_uuids:
                seen_uuids.add(record["uuid"])
                doc_id = _parse_document_id(record["source_description"])
                documents.append(
                    {
                        "document_id": doc_id,
                        "filename": record["name"],
                        "relevance": float(record["relevance"]),
                        "matched_entities": record["matched_entities"][:5],
                        "valid_at": record["valid_at"].isoformat()
                        if record.get("valid_at")
                        else None,
                        "content_preview": (record["content"] or "")[:200]
                        if record.get("content")
                        else None,
                    }
                )
    except Exception as e:
        logger.warning(f"Entity-based document search failed: {e}")

    # Strategy 3: Full-text search on episode name and source_description
    try:
        # Use case-insensitive CONTAINS for text matching
        text_cypher = """
        MATCH (episode:Episodic)
        WHERE episode.group_id = $group_id
        AND (toLower(episode.name) CONTAINS toLower($query) 
             OR toLower(episode.source_description) CONTAINS toLower($query)
             OR toLower(episode.content) CONTAINS toLower($query))
        RETURN episode.uuid AS uuid, 
               episode.name AS name, 
               episode.source_description AS source_description, 
               episode.valid_at AS valid_at,
               episode.content AS content,
               0.5 AS relevance,
               [] AS matched_entities
        LIMIT $limit
        """

        text_results = await client.driver.execute_query(
            text_cypher,
            query=query,
            group_id=user_id,
            limit=limit,
        )

        for record in text_results.records:
            if record["uuid"] not in seen_uuids:
                seen_uuids.add(record["uuid"])
                doc_id = _parse_document_id(record["source_description"])
                documents.append(
                    {
                        "document_id": doc_id,
                        "filename": record["name"],
                        "relevance": float(record["relevance"]),
                        "matched_entities": [],
                        "valid_at": record["valid_at"].isoformat()
                        if record.get("valid_at")
                        else None,
                        "content_preview": (record["content"] or "")[:200]
                        if record.get("content")
                        else None,
                    }
                )
    except Exception as e:
        logger.warning(f"Text-based document search failed: {e}")

    # Sort by relevance and limit results
    documents.sort(key=lambda x: x["relevance"], reverse=True)
    limited_docs = documents[:limit]

    # NORMALIZE scores to 0-1 range
    # Find max score for normalization
    if limited_docs:
        max_score = max(doc["relevance"] for doc in limited_docs)
        if max_score > 1.0:
            # Normalize all scores proportionally
            for doc in limited_docs:
                doc["relevance"] = min(0.95, doc["relevance"] / max_score)
        else:
            # Scores already in range, just ensure they don't exceed 1.0
            for doc in limited_docs:
                doc["relevance"] = min(1.0, max(0.0, doc["relevance"]))

    logger.info(
        f"Document search returned {len(limited_docs)} results. "
        f"Top scores: {[round(d['relevance'], 2) for d in limited_docs[:3]]}"
    )

    return limited_docs


def _build_search_config(
    num_results: int,
    center_node_uuid: str | None,
    include_communities: bool,
):
    """Build Graphiti SearchConfig for hybrid search."""
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

    # Select reranker based on whether we have a center node
    edge_reranker = EdgeReranker.node_distance if center_node_uuid else EdgeReranker.rrf
    node_reranker = NodeReranker.node_distance if center_node_uuid else NodeReranker.rrf

    config = SearchConfig(
        edge_config=EdgeSearchConfig(
            search_methods=[
                EdgeSearchMethod.bm25,
                EdgeSearchMethod.cosine_similarity,
                EdgeSearchMethod.bfs,
            ],
            reranker=edge_reranker,
        ),
        node_config=NodeSearchConfig(
            search_methods=[
                NodeSearchMethod.bm25,
                NodeSearchMethod.cosine_similarity,
                NodeSearchMethod.bfs,
            ],
            reranker=node_reranker,
        ),
        limit=num_results,
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


def format_search_results(
    results: "SearchResults",
    include_communities: bool = False,
    episode_contents: list[str] | None = None,
) -> str:
    """
    Format search results into a string for LLM prompts.

    Parameters
    ----------
    results : SearchResults
        Graphiti search results with edges, nodes, and communities.
    include_communities : bool
        Whether to include community summaries.
    episode_contents : list[str] | None
        Direct episode contents from fallback searches.

    Returns
    -------
    str
        Formatted markdown string.
    """
    sections = []

    # Direct Episode Content (most reliable source)
    if episode_contents:
        content_section = ["## Document Content"]
        for i, content in enumerate(episode_contents[:10], 1):
            # Truncate very long content
            truncated = content[:1500] + "..." if len(content) > 1500 else content
            content_section.append(f"### Source {i}\n{truncated}")
        sections.append("\n\n".join(content_section))

    # Facts (edges - relationships between entities)
    if results.edges:
        facts = ["## Relevant Facts"]
        for i, edge in enumerate(results.edges[:20], 1):  # Limit to 20 facts
            # Include created_at if available for temporal context
            time_info = ""
            if hasattr(edge, "created_at") and edge.created_at:
                time_info = f" (recorded: {edge.created_at.strftime('%Y-%m-%d')})"
            facts.append(f"{i}. {edge.fact}{time_info}")
        sections.append("\n".join(facts))

    # Entities (nodes - key concepts and entities)
    if results.nodes:
        entities = ["## Key Entities"]
        for node in results.nodes[:15]:  # Limit to 15 entities
            summary = node.summary or "No summary available"
            # Truncate long summaries
            if len(summary) > 300:
                summary = summary[:300] + "..."
            entities.append(f"- **{node.name}**: {summary}")
        sections.append("\n".join(entities))

    # Episodes (direct document sources)
    if results.episodes:
        episodes_section = ["## Source Documents"]
        for episode in results.episodes[:5]:  # Limit to 5 episodes
            content = episode.content or ""
            truncated = content[:500] + "..." if len(content) > 500 else content
            name = episode.name or "Unnamed document"
            episodes_section.append(f"### {name}\n{truncated}")
        sections.append("\n\n".join(episodes_section))

    # Communities (topic summaries)
    if include_communities and results.communities:
        communities = ["## Topic Summaries"]
        for community in results.communities[:5]:  # Limit to 5 communities
            summary = community.summary or "No summary"
            if len(summary) > 400:
                summary = summary[:400] + "..."
            communities.append(f"- **{community.name}**: {summary}")
        sections.append("\n".join(communities))

    if not sections:
        return "No relevant information found in the knowledge graph."

    return "\n\n".join(sections)


def _parse_document_id(source_description: str) -> str | None:
    """Extract document_id from source_description if present."""
    # Format: "Document: {name} (doc_id: {id})"
    if "(doc_id: " in source_description:
        try:
            return source_description.split("(doc_id: ")[1].rstrip(")")
        except IndexError:
            pass
    return None
