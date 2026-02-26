from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from graphrag.client import get_graphiti_client
from graphrag.entity_types import get_entity_types, get_edge_types, get_edge_type_map
from core.instrumented_openai import set_metrics_context

if TYPE_CHECKING:
    from graphiti_core import Graphiti
    from graphiti_core.nodes import EntityNode

logger = logging.getLogger(__name__)


CHUNK_THRESHOLD = 10000


async def ingest_document_episode(
    user_id: str,
    document_name: str,
    content: str,
    document_id: str | None = None,
    reference_time: datetime | None = None,
) -> dict:
    from graphiti_core.nodes import EpisodeType

    set_metrics_context(user_id=user_id, operation="graphiti_ingestion")

    client = await get_graphiti_client()

    if reference_time is None:
        reference_time = datetime.now()

    content_length = len(content)
    estimated_content_tokens = content_length // 4

    logger.info(
        f"Ingesting document for user {user_id}: {document_name}",
        extra={
            "user_id": user_id,
            "document_name": document_name,
            "content_length_chars": content_length,
            "estimated_content_tokens": estimated_content_tokens,
            "will_chunk": content_length > CHUNK_THRESHOLD,
            "chunk_threshold": CHUNK_THRESHOLD,
        },
    )

    try:
        if content_length > CHUNK_THRESHOLD:
            return await _ingest_chunked_document(
                client=client,
                user_id=user_id,
                document_name=document_name,
                content=content,
                document_id=document_id,
                reference_time=reference_time,
            )

        estimated_schema_tokens = len(get_entity_types()) * 50 + len(get_edge_types()) * 50
        estimated_content_tokens = content_length // 4

        logger.info(
            f"📄 Small document - no chunking needed",
            extra={
                "document_id": document_id,
                "content_chars": content_length,
                "content_tokens_est": estimated_content_tokens,
                "schema_tokens_est": estimated_schema_tokens,
                "estimated_input_tokens_per_call": estimated_content_tokens
                + estimated_schema_tokens
                + 300,
                "min_llm_calls_expected": 2,
            },
        )

        source_desc = f"Document: {document_name}"
        if document_id:
            source_desc += f" (doc_id: {document_id})"

        result = await client.add_episode(
            name=document_name,
            episode_body=content,
            source_description=source_desc,
            reference_time=reference_time,
            source=EpisodeType.text,
            group_id=user_id,
            entity_types=get_entity_types(),
            edge_types=get_edge_types(),
            edge_type_map=get_edge_type_map(),
        )

        logger.info(
            f"Document ingestion complete: {len(result.nodes)} nodes, {len(result.edges)} edges",
            extra={
                "episode_uuid": result.episode.uuid,
                "node_count": len(result.nodes),
                "edge_count": len(result.edges),
            },
        )

        return {
            "episode_uuid": result.episode.uuid,
            "episode_uuids": [result.episode.uuid],
            "document_id": document_id,
            "node_count": len(result.nodes),
            "edge_count": len(result.edges),
            "chunk_count": 1,
            "nodes": [{"uuid": n.uuid, "name": n.name} for n in result.nodes],
            "edges": [{"uuid": e.uuid, "fact": e.fact} for e in result.edges],
        }

    except Exception as e:
        logger.error(f"Failed to ingest document: {e}", exc_info=True)
        raise


async def _ingest_chunked_document(
    client: "Graphiti",
    user_id: str,
    document_name: str,
    content: str,
    document_id: str | None,
    reference_time: datetime,
) -> dict:
    from graphiti_core.utils.bulk_utils import RawEpisode
    from graphiti_core.nodes import EpisodeType
    from services.chunking import DocumentChunker

    chunker = DocumentChunker(
        chunk_size=5000,
        min_chunk_size=1000,
    )

    chunks = chunker.chunk_document(content, document_name, document_id)

    if not chunks:
        logger.warning(f"No chunks generated for document {document_id}")
        return {
            "episode_uuids": [],
            "document_id": document_id,
            "node_count": 0,
            "edge_count": 0,
            "chunk_count": 0,
        }

    total_chunk_chars = sum(len(chunk.content) for chunk in chunks)
    avg_chunk_chars = total_chunk_chars // len(chunks) if chunks else 0
    estimated_chunk_tokens = avg_chunk_chars // 4

    estimated_schema_tokens = len(get_entity_types()) * 50 + len(get_edge_types()) * 50

    min_llm_calls = len(chunks) * 2
    estimated_input_tokens = min_llm_calls * (
        estimated_chunk_tokens + estimated_schema_tokens + 300
    )

    logger.info(
        f"📊 Document chunking analysis for: {document_name}",
        extra={
            "document_id": document_id,
            "document_name": document_name,
            "chunk_count": len(chunks),
            "total_content_chars": len(content),
            "total_content_tokens_est": len(content) // 4,
            "avg_chunk_chars": avg_chunk_chars,
            "avg_chunk_tokens_est": estimated_chunk_tokens,
            "schema_overhead_tokens_est": estimated_schema_tokens,
            "entity_types_count": len(get_entity_types()),
            "edge_types_count": len(get_edge_types()),
            "min_llm_calls_expected": min_llm_calls,
            "estimated_total_input_tokens": estimated_input_tokens,
            "token_breakdown": {
                "content_per_call": estimated_chunk_tokens,
                "schema_per_call": estimated_schema_tokens,
                "system_prompt_per_call": 300,
                "total_per_call": estimated_chunk_tokens + estimated_schema_tokens + 300,
            },
        },
    )

    raw_episodes = []
    for chunk in chunks:
        episode_name = f"Document: {document_name} - {chunk.part_name}"

        source_desc = f"Chunk {chunk.index + 1} of document: {document_name}"
        if document_id:
            source_desc += f" (doc_id: {document_id})"

        chunk_time = reference_time + timedelta(seconds=chunk.index)

        raw_episodes.append(
            RawEpisode(
                name=episode_name,
                content=chunk.content,
                source_description=source_desc,
                source=EpisodeType.text,
                reference_time=chunk_time,
            )
        )

    result = await client.add_episode_bulk(
        bulk_episodes=raw_episodes,
        group_id=user_id,
        entity_types=get_entity_types(),
        edge_types=get_edge_types(),
        edge_type_map=get_edge_type_map(),
    )

    actual_episodes = len(result.episodes)
    actual_nodes = len(result.nodes)
    actual_edges = len(result.edges)

    estimated_actual_llm_calls = 2 * actual_episodes + (2 * actual_nodes) + actual_edges

    logger.info(
        f"✅ Chunked document ingestion complete",
        extra={
            "document_id": document_id,
            "document_name": document_name,
            "chunks_processed": len(chunks),
            "episodes_created": actual_episodes,
            "nodes_extracted": actual_nodes,
            "edges_extracted": actual_edges,
            "estimated_llm_calls": estimated_actual_llm_calls,
            "estimated_input_tokens": estimated_actual_llm_calls
            * (estimated_chunk_tokens + estimated_schema_tokens + 300),
            "cost_breakdown": {
                "content_tokens_total": len(content) // 4,
                "schema_overhead_total": estimated_actual_llm_calls * estimated_schema_tokens,
                "system_prompts_total": estimated_actual_llm_calls * 300,
            },
        },
    )

    return {
        "episode_uuids": [e.uuid for e in result.episodes],
        "document_id": document_id,
        "node_count": len(result.nodes),
        "edge_count": len(result.edges),
        "chunk_count": len(chunks),
    }


async def ingest_document_bulk(
    user_id: str,
    documents: list[dict],
) -> dict:
    from graphiti_core.utils.bulk_utils import RawEpisode
    from graphiti_core.nodes import EpisodeType

    client = await get_graphiti_client()

    logger.info(
        f"Bulk ingesting {len(documents)} documents for user {user_id}",
        extra={"user_id": user_id, "document_count": len(documents)},
    )

    try:
        raw_episodes = [
            RawEpisode(
                name=doc["name"],
                content=doc["content"],
                source_description=f"Document: {doc['name']}",
                source=EpisodeType.text,
                reference_time=doc.get("reference_time", datetime.now()),
            )
            for doc in documents
        ]

        result = await client.add_episode_bulk(
            bulk_episodes=raw_episodes,
            group_id=user_id,
            entity_types=get_entity_types(),
            edge_types=get_edge_types(),
            edge_type_map=get_edge_type_map(),
        )

        logger.info(
            f"Bulk ingestion complete: {len(result.nodes)} nodes, {len(result.edges)} edges",
            extra={
                "episode_count": len(result.episodes),
                "node_count": len(result.nodes),
                "edge_count": len(result.edges),
            },
        )

        return {
            "episode_count": len(result.episodes),
            "node_count": len(result.nodes),
            "edge_count": len(result.edges),
            "episode_uuids": [e.uuid for e in result.episodes],
        }

    except Exception as e:
        logger.error(f"Failed bulk ingestion: {e}", exc_info=True)
        raise


async def ensure_user_entity(
    client: "Graphiti",
    user_id: str,
) -> "EntityNode | None":
    from graphiti_core.nodes import EntityNode
    from graphiti_core.search.search_config import SearchConfig, NodeSearchConfig, NodeSearchMethod

    try:
        search_config = SearchConfig(
            node_config=NodeSearchConfig(
                search_methods=[NodeSearchMethod.bm25],
            ),
            limit=1,
        )

        results = await client.search_(
            query=f"User {user_id}",
            config=search_config,
            group_ids=[user_id],
        )

        if results.nodes:
            for node in results.nodes:
                if node.name == f"User_{user_id}" or user_id in node.name:
                    return node

        user_node = EntityNode(
            name=f"User_{user_id}",
            group_id=user_id,
            labels=["User", "Entity"],
            summary=f"User account with ID {user_id}",
        )

        await user_node.generate_name_embedding(client.embedder)
        await user_node.save(client.driver)

        logger.debug(f"Created user entity node: {user_node.uuid}")
        return user_node

    except Exception as e:
        logger.warning(f"Failed to ensure user entity: {e}")
        return None


async def delete_document_from_graph(
    user_id: str,
    document_id: str,
) -> dict:
    from graphiti_core.nodes import EpisodicNode, EntityNode

    client = await get_graphiti_client()

    logger.info(
        f"Deleting document {document_id} from graph for user {user_id}",
        extra={"user_id": user_id, "document_id": document_id},
    )

    try:
        doc_id_marker = f"(doc_id: {document_id})"

        find_episodes_query = """
        MATCH (episode:Episodic)
        WHERE episode.source_description CONTAINS $doc_id_marker
        AND episode.group_id = $user_id
        RETURN episode.uuid AS uuid
        """

        episode_result = await client.driver.execute_query(
            find_episodes_query,
            doc_id_marker=doc_id_marker,
            user_id=user_id,
        )

        episode_uuids = [record["uuid"] for record in episode_result.records]

        if not episode_uuids:
            logger.warning(f"No episodes found for document {document_id}")
            return {
                "deleted_episodes": 0,
                "deleted_entities": 0,
                "deleted_edges": 0,
            }

        logger.info(f"Found {len(episode_uuids)} episodes to delete")

        find_entities_query = """
        MATCH (episode:Episodic)-[:MENTIONS]->(entity:Entity)
        WHERE episode.uuid IN $episode_uuids
        AND entity.group_id = $user_id
        RETURN DISTINCT entity.uuid AS uuid
        """

        entity_result = await client.driver.execute_query(
            find_entities_query,
            episode_uuids=episode_uuids,
            user_id=user_id,
        )

        entity_uuids = [record["uuid"] for record in entity_result.records]

        logger.info(f"Found {len(entity_uuids)} entities to delete")

        episodes_deleted = 0
        for episode_uuid in episode_uuids:
            try:
                episode = await EpisodicNode.get_by_uuid(client.driver, episode_uuid)

                await episode.delete(client.driver)
                episodes_deleted += 1
            except Exception as e:
                logger.warning(f"Failed to delete episode {episode_uuid}: {e}")

        entities_deleted = 0
        for entity_uuid in entity_uuids:
            try:
                entity = await EntityNode.get_by_uuid(client.driver, entity_uuid)

                await entity.delete(client.driver)
                entities_deleted += 1
            except Exception as e:
                logger.warning(f"Failed to delete entity {entity_uuid}: {e}")

        logger.info(
            f"Document deletion complete: {episodes_deleted} episodes, "
            f"{entities_deleted} entities deleted",
            extra={
                "document_id": document_id,
                "episodes_deleted": episodes_deleted,
                "entities_deleted": entities_deleted,
            },
        )

        return {
            "deleted_episodes": episodes_deleted,
            "deleted_entities": entities_deleted,
            "deleted_edges": 0,
        }

    except Exception as e:
        logger.error(f"Failed to delete document from graph: {e}", exc_info=True)
        raise
