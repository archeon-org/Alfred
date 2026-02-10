"""
Graphiti Document Ingestion

Single Responsibility: Ingest documents into the knowledge graph.
- Episode creation from document content
- Document chunking for large documents
- User entity management (group_id based isolation)
"""

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

# Threshold for chunking documents (characters)
# Increased to 10000 to avoid chunking smaller documents
# A typical resume is ~4000-6000 chars, research paper ~15000-25000 chars
# Fewer chunks = fewer LLM calls = lower costs
CHUNK_THRESHOLD = 10000


async def ingest_document_episode(
    user_id: str,
    document_name: str,
    content: str,
    document_id: str | None = None,
    reference_time: datetime | None = None,
) -> dict:
    """
    Ingest a document into the knowledge graph.

    For large documents (>3000 chars), automatically chunks the content
    and uses bulk ingestion for efficiency.

    Creates RawEpisode(s) from the document content and ingests into
    Graphiti, associating them with the user's entity node.

    Parameters
    ----------
    user_id : str
        The user who owns this document (used for graph partitioning).
    document_name : str
        The original name/title of the document.
    content : str
        The cleaned text content of the document.
    document_id : str, optional
        A unique identifier for the document.
    reference_time : datetime, optional
        The reference time for the episode. Defaults to now.

    Returns
    -------
    dict
        Contains: episode_uuid(s), document_id, node_count, edge_count, chunk_count
    """
    from graphiti_core.nodes import EpisodeType

    # Set metrics context for tracking LLM calls
    set_metrics_context(user_id=user_id, operation="graphiti_ingestion")

    client = await get_graphiti_client()

    if reference_time is None:
        reference_time = datetime.now()

    content_length = len(content)
    estimated_content_tokens = content_length // 4  # Rough estimate: 1 token ≈ 4 chars

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
        # For large documents, use chunking with bulk ingestion
        if content_length > CHUNK_THRESHOLD:
            return await _ingest_chunked_document(
                client=client,
                user_id=user_id,
                document_name=document_name,
                content=content,
                document_id=document_id,
                reference_time=reference_time,
            )

        # For small documents, use single episode
        estimated_schema_tokens = len(get_entity_types()) * 50 + len(get_edge_types()) * 50
        estimated_content_tokens = content_length // 4
        
        logger.info(
            f"📄 Small document - no chunking needed",
            extra={
                "document_id": document_id,
                "content_chars": content_length,
                "content_tokens_est": estimated_content_tokens,
                "schema_tokens_est": estimated_schema_tokens,
                "estimated_input_tokens_per_call": estimated_content_tokens + estimated_schema_tokens + 300,
                "min_llm_calls_expected": 2,  # entity + edge extraction
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
    """
    Ingest a large document by chunking it and using bulk ingestion.

    Follows Graphiti best practices:
    - Chunks are 1000-3000 characters with 10-20% overlap
    - Uses add_episode_bulk() for efficiency
    - Maintains temporal ordering via reference_time
    - Uses consistent naming pattern for related chunks
    """
    from graphiti_core.utils.bulk_utils import RawEpisode
    from graphiti_core.nodes import EpisodeType
    from services.chunking import DocumentChunker

    # Configure chunking - larger chunks = fewer LLM calls = lower costs
    # NOTE: Until chonkie is installed via docker rebuild, fallback uses character count
    # 5000 chars ≈ 1250 tokens, which is reasonable for entity extraction
    chunker = DocumentChunker(
        chunk_size=5000,  # Large chunks to minimize LLM calls
        min_chunk_size=1000,  # Avoid tiny chunks
    )

    # Create chunks
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

    # Calculate token estimates for better visibility
    total_chunk_chars = sum(len(chunk.content) for chunk in chunks)
    avg_chunk_chars = total_chunk_chars // len(chunks) if chunks else 0
    estimated_chunk_tokens = avg_chunk_chars // 4
    
    # Estimate schema overhead (18 entity types + 18 edge types with descriptions)
    # Each type has ~50 tokens (name + description), so ~1,800 tokens total
    estimated_schema_tokens = len(get_entity_types()) * 50 + len(get_edge_types()) * 50
    
    # Each chunk makes ~2 LLM calls minimum (entity extraction + edge extraction)
    min_llm_calls = len(chunks) * 2
    estimated_input_tokens = min_llm_calls * (estimated_chunk_tokens + estimated_schema_tokens + 300)  # +300 for system prompt

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

    # Convert chunks to RawEpisode format
    # Use consistent naming: "Document: {name} - Part N/M (doc_id: {id})"
    raw_episodes = []
    for chunk in chunks:
        # Build descriptive name
        episode_name = f"Document: {document_name} - {chunk.part_name}"

        # Build source_description with document_id for deletion/search
        source_desc = f"Chunk {chunk.index + 1} of document: {document_name}"
        if document_id:
            source_desc += f" (doc_id: {document_id})"

        # Use timedelta to maintain temporal ordering of chunks
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

    # Bulk ingestion - more efficient than individual add_episode calls
    result = await client.add_episode_bulk(
        bulk_episodes=raw_episodes,
        group_id=user_id,
        entity_types=get_entity_types(),
        edge_types=get_edge_types(),
        edge_type_map=get_edge_type_map(),
    )

    # Calculate actual results and compare to estimates
    actual_episodes = len(result.episodes)
    actual_nodes = len(result.nodes)
    actual_edges = len(result.edges)
    
    # Each episode likely triggered: entity extraction, edge extraction, 
    # node resolution (per node), edge resolution (per edge), attribute extraction (per node)
    # Rough estimate: 2 + nodes + edges + nodes = 2 + (2 * nodes) + edges LLM calls
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
            "estimated_input_tokens": estimated_actual_llm_calls * (estimated_chunk_tokens + estimated_schema_tokens + 300),
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
    """
    Ingest multiple document chunks in bulk.

    More efficient than calling ingest_document_episode multiple times.

    Parameters
    ----------
    user_id : str
        The unique identifier of the user.
    documents : list[dict]
        List of documents with: name (str), content (str), reference_time (datetime, optional)

    Returns
    -------
    dict
        Summary: episode_count, node_count, edge_count, episode_uuids
    """
    from graphiti_core.utils.bulk_utils import RawEpisode
    from graphiti_core.nodes import EpisodeType

    client = await get_graphiti_client()

    logger.info(
        f"Bulk ingesting {len(documents)} documents for user {user_id}",
        extra={"user_id": user_id, "document_count": len(documents)},
    )

    try:
        # Convert to RawEpisode format
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

        # Bulk ingestion
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
    """
    Ensure a user entity node exists in the graph.

    Creates or retrieves the EntityNode representing the user,
    which serves as the center point for personalized searches.

    Parameters
    ----------
    client : Graphiti
        The Graphiti client instance.
    user_id : str
        The user's unique identifier.

    Returns
    -------
    EntityNode | None
        The user's entity node, or None if creation fails.
    """
    from graphiti_core.nodes import EntityNode
    from graphiti_core.search.search_config import SearchConfig, NodeSearchConfig, NodeSearchMethod

    try:
        # Search for existing user entity
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

        # Check if we found the user entity
        if results.nodes:
            for node in results.nodes:
                if node.name == f"User_{user_id}" or user_id in node.name:
                    return node

        # Create user entity if not found
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
    """
    Delete a document and its related entities from the knowledge graph.

    Uses Graphiti's built-in CRUD operations to properly remove episodes
    and entities associated with a specific document.

    Parameters
    ----------
    user_id : str
        The user who owns the document (for validation).
    document_id : str
        The unique identifier of the document to delete.

    Returns
    -------
    dict
        Contains: deleted_episodes, deleted_entities, deleted_edges
    """
    from graphiti_core.nodes import EpisodicNode, EntityNode

    client = await get_graphiti_client()

    logger.info(
        f"Deleting document {document_id} from graph for user {user_id}",
        extra={"user_id": user_id, "document_id": document_id},
    )

    try:
        doc_id_marker = f"(doc_id: {document_id})"

        # Step 1: Find episode UUIDs for this document
        # Episodes have source_description like: "Document: {name} (doc_id: {document_id})"
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

        # Step 2: Find entity UUIDs mentioned by these episodes
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

        # Step 3: Get and delete episodes using Graphiti's CRUD operations
        episodes_deleted = 0
        for episode_uuid in episode_uuids:
            try:
                # Use Graphiti's get_by_uuid class method
                episode = await EpisodicNode.get_by_uuid(client.driver, episode_uuid)
                # Use Graphiti's delete method
                await episode.delete(client.driver)
                episodes_deleted += 1
            except Exception as e:
                logger.warning(f"Failed to delete episode {episode_uuid}: {e}")

        # Step 4: Get and delete entities using Graphiti's CRUD operations
        entities_deleted = 0
        for entity_uuid in entity_uuids:
            try:
                # Use Graphiti's get_by_uuid class method
                entity = await EntityNode.get_by_uuid(client.driver, entity_uuid)
                # Use Graphiti's delete method
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
            "deleted_edges": 0,  # Edges are deleted via DETACH DELETE in node.delete()
        }

    except Exception as e:
        logger.error(f"Failed to delete document from graph: {e}", exc_info=True)
        raise
