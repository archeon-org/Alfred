"""
Graphiti Knowledge Graph Tasks

Celery tasks for knowledge graph operations:
- Document ingestion into the graph
- Context retrieval for RAG queries
- Graph maintenance operations
"""

import asyncio
from datetime import datetime
from typing import TypedDict

from celery import shared_task

from core.celery_app import celery_app
from core.database import get_sync_session_factory
from core.logging import get_logger
from graphrag.config import get_graphiti_settings
from services.notification import (
    get_notification_service,
    CreateNotificationDTO,
    NotificationType,
)

logger = get_logger(__name__)


class IngestDocumentJobData(TypedDict):
    """Data for ingest-document-graph task."""

    documentId: str
    userId: str
    documentName: str
    content: str
    referenceTime: str | None  # ISO format datetime string


class IngestBulkJobData(TypedDict):
    """Data for bulk document ingestion."""

    userId: str
    documents: list[dict]  # List of {name, content, referenceTime?}


class RetrieveContextJobData(TypedDict):
    """Data for context retrieval task."""

    userId: str
    query: str
    numResults: int | None


def _run_async(coro):
    """Helper to run async code in sync Celery tasks."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="scribe.tasks.graphiti.ingest_document_to_graph",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": 2},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,  # 10 minutes - reasonable for simplified entity types
    time_limit=720,  # 12 minutes hard limit
)
def ingest_document_to_graph(self, data: dict) -> dict:
    """
    Ingest a document into the Graphiti knowledge graph.

    This task extracts entities and relationships from the document content
    and stores them in Neo4j, associated with the user.

    Parameters
    ----------
    data : dict
        Task data containing:
        - documentId: Document identifier
        - userId: User identifier for graph partitioning
        - documentName: Original document name
        - content: Extracted text content
        - referenceTime: Optional ISO datetime string

    Returns
    -------
    dict
        Result containing episode_uuid, node_count, edge_count
    """
    settings = get_graphiti_settings()

    if not settings.enabled:
        logger.info("Graphiti is disabled, skipping document ingestion")
        # Still send success notification even when graphiti is disabled
        # The document was successfully processed (OCR, classification done)
        document_id = data["documentId"]
        user_id = data["userId"]
        document_name = data["documentName"]
        _send_processing_notification(
            user_id=user_id,
            document_id=document_id,
            document_name=document_name,
            node_count=0,
            edge_count=0,
            success=True,
            graphiti_disabled=True,
        )
        return {"status": "skipped", "reason": "graphiti_disabled"}

    document_id = data["documentId"]
    user_id = data["userId"]
    document_name = data["documentName"]
    content = data["content"]
    reference_time_str = data.get("referenceTime")

    logger.info(
        "Ingesting document to knowledge graph",
        document_id=document_id,
        user_id=user_id,
        document_name=document_name,
        content_length=len(content),
        retry=self.request.retries,
    )

    try:
        # Parse reference time if provided
        reference_time = None
        if reference_time_str:
            try:
                reference_time = datetime.fromisoformat(reference_time_str)
            except ValueError:
                logger.warning(f"Invalid reference time format: {reference_time_str}")

        # Run the async ingestion
        from graphrag import ingest_document_episode

        result = _run_async(
            ingest_document_episode(
                user_id=user_id,
                document_name=document_name,
                content=content,
                document_id=document_id,
                reference_time=reference_time,
            )
        )

        logger.info(
            "Document ingested to graph successfully",
            document_id=document_id,
            episode_uuid=result.get("episode_uuid"),
            node_count=result.get("node_count"),
            edge_count=result.get("edge_count"),
        )

        # Send success notification
        _send_processing_notification(
            user_id=user_id,
            document_id=document_id,
            document_name=document_name,
            node_count=result.get("node_count", 0),
            edge_count=result.get("edge_count", 0),
            success=True,
        )

        return {
            "status": "success",
            "document_id": document_id,
            "episode_uuid": result.get("episode_uuid"),
            "node_count": result.get("node_count"),
            "edge_count": result.get("edge_count"),
        }

    except Exception as e:
        logger.error(
            "Failed to ingest document to graph",
            document_id=document_id,
            error=str(e),
            retry_count=self.request.retries,
            exc_info=True,
        )

        # Only send failure notification on FINAL retry attempt (to avoid spam)
        max_retries = self.max_retries or 2
        is_final_attempt = self.request.retries >= max_retries

        if is_final_attempt:
            _send_processing_notification(
                user_id=user_id,
                document_id=document_id,
                document_name=document_name,
                node_count=0,
                edge_count=0,
                success=False,
                error_message=str(e),
            )
        else:
            logger.info(
                "Skipping failure notification (will retry)",
                document_id=document_id,
                retry=self.request.retries,
                max_retries=max_retries,
            )
        raise


def _send_processing_notification(
    user_id: str,
    document_id: str,
    document_name: str,
    node_count: int,
    edge_count: int,
    success: bool,
    error_message: str | None = None,
    graphiti_disabled: bool = False,
) -> None:
    """
    Send push notification after document processing completes.

    This is the FINAL notification in the workflow - called only after:
    - All retries have been exhausted (for failures)
    - Processing fully completed (for success)

    Parameters
    ----------
    user_id : str
        User to notify
    document_id : str
        Document that was processed
    document_name : str
        Name of the document
    node_count : int
        Number of entities extracted
    edge_count : int
        Number of relationships created
    success : bool
        Whether processing succeeded
    error_message : str, optional
        Error message if failed
    graphiti_disabled : bool
        If True, graphiti was disabled so no graph operations were performed
    """
    try:
        session_factory = get_sync_session_factory()
        session = session_factory()

        notification_service = get_notification_service()

        if success:
            if graphiti_disabled:
                message = f'"{document_name}" has been processed and classified.'
            else:
                message = f'"{document_name}" has been processed. Extracted {node_count} entities and {edge_count} relationships.'

            notification_service.create(
                session,
                CreateNotificationDTO(
                    user_id=user_id,
                    title="Document Processed",
                    message=message,
                    redirect=f"/(app)/documents/{document_id}",
                    notification_type=NotificationType.DOCUMENT_CLASSIFIED,
                    data={
                        "documentId": document_id,
                        "nodeCount": node_count,
                        "edgeCount": edge_count,
                    },
                ),
            )
        else:
            notification_service.create(
                session,
                CreateNotificationDTO(
                    user_id=user_id,
                    title="Document Processing Issue",
                    message=f'"{document_name}" was classified but knowledge graph sync encountered an issue.',
                    redirect=f"/(app)/documents/{document_id}",
                    notification_type=NotificationType.DOCUMENT_ERROR,
                    data={"documentId": document_id},
                ),
            )

        session.close()
        logger.info(
            "Sent processing notification",
            document_id=document_id,
            success=success,
            graphiti_disabled=graphiti_disabled,
        )
    except Exception as e:
        logger.error(
            "Failed to send processing notification",
            document_id=document_id,
            error=str(e),
        )


@celery_app.task(
    name="scribe.tasks.graphiti.ingest_documents_bulk",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=30,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=600,  # 10 minutes
    time_limit=720,  # 12 minutes hard limit
)
def ingest_documents_bulk(self, data: dict) -> dict:
    """
    Ingest multiple documents into the knowledge graph in bulk.

    More efficient than individual ingestion for batch processing.

    Parameters
    ----------
    data : dict
        Task data containing:
        - userId: User identifier
        - documents: List of {name, content, referenceTime?}

    Returns
    -------
    dict
        Result containing episode_count, node_count, edge_count
    """
    settings = get_graphiti_settings()

    if not settings.enabled:
        logger.info("Graphiti is disabled, skipping bulk ingestion")
        return {"status": "skipped", "reason": "graphiti_disabled"}

    user_id = data["userId"]
    documents = data["documents"]

    logger.info(
        "Bulk ingesting documents to knowledge graph",
        user_id=user_id,
        document_count=len(documents),
        retry=self.request.retries,
    )

    try:
        # Parse documents with reference times
        parsed_docs = []
        for doc in documents:
            parsed_doc = {
                "name": doc["name"],
                "content": doc["content"],
            }
            if doc.get("referenceTime"):
                try:
                    parsed_doc["reference_time"] = datetime.fromisoformat(doc["referenceTime"])
                except ValueError:
                    pass
            parsed_docs.append(parsed_doc)

        # Run bulk ingestion
        from graphrag import ingest_document_bulk

        result = _run_async(
            ingest_document_bulk(
                user_id=user_id,
                documents=parsed_docs,
            )
        )

        logger.info(
            "Bulk ingestion complete",
            user_id=user_id,
            episode_count=result.get("episode_count"),
            node_count=result.get("node_count"),
            edge_count=result.get("edge_count"),
        )

        return {
            "status": "success",
            "episode_count": result.get("episode_count"),
            "node_count": result.get("node_count"),
            "edge_count": result.get("edge_count"),
            "episode_uuids": result.get("episode_uuids", []),
        }

    except Exception as e:
        logger.error(
            "Failed bulk document ingestion",
            user_id=user_id,
            document_count=len(documents),
            error=str(e),
            exc_info=True,
        )
        raise


@celery_app.task(
    name="scribe.tasks.graphiti.retrieve_context",
    bind=True,
    acks_late=True,
    soft_time_limit=60,  # 1 minute
    time_limit=90,  # 1.5 minutes hard limit
)
def retrieve_context(self, data: dict) -> dict:
    """
    Retrieve context from the knowledge graph for a query.

    This is typically called from the API layer to get relevant context
    for RAG (Retrieval-Augmented Generation) operations.

    Parameters
    ----------
    data : dict
        Task data containing:
        - userId: User identifier
        - query: Natural language query
        - numResults: Optional max results (default: 10)

    Returns
    -------
    dict
        Result containing formatted context string
    """
    settings = get_graphiti_settings()

    if not settings.enabled:
        return {
            "status": "skipped",
            "context": "",
            "reason": "graphiti_disabled",
        }

    user_id = data["userId"]
    query = data["query"]
    num_results = data.get("numResults", settings.search_limit)

    logger.info(
        "Retrieving context from knowledge graph",
        user_id=user_id,
        query_preview=query[:50] + "..." if len(query) > 50 else query,
    )

    try:
        from graphrag import retrieve_context_for_query

        context = _run_async(
            retrieve_context_for_query(
                user_id=user_id,
                query=query,
                num_results=num_results,
            )
        )

        logger.info(
            "Context retrieved successfully",
            user_id=user_id,
            context_length=len(context),
        )

        return {
            "status": "success",
            "context": context,
        }

    except Exception as e:
        logger.error(
            "Failed to retrieve context",
            user_id=user_id,
            error=str(e),
            exc_info=True,
        )
        return {
            "status": "error",
            "context": "",
            "error": str(e),
        }


@celery_app.task(
    name="scribe.tasks.graphiti.initialize_graph",
    bind=True,
    acks_late=True,
    soft_time_limit=120,
    time_limit=180,
)
def initialize_graph(self) -> dict:
    """
    Initialize the Graphiti graph database.

    This task sets up indices and constraints in Neo4j.
    Should be called on application startup or when setting up a new environment.

    Returns
    -------
    dict
        Status of initialization
    """
    settings = get_graphiti_settings()

    if not settings.enabled:
        return {"status": "skipped", "reason": "graphiti_disabled"}

    logger.info("Initializing Graphiti knowledge graph...")

    try:
        from graphrag import initialize_graphiti

        _run_async(initialize_graphiti())

        logger.info("Graphiti initialization complete")
        return {"status": "success"}

    except Exception as e:
        logger.error(
            "Failed to initialize Graphiti",
            error=str(e),
            exc_info=True,
        )
        return {"status": "error", "error": str(e)}


@celery_app.task(
    name="scribe.tasks.graphiti.delete_document_from_graph",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=10,
    retry_kwargs={"max_retries": 2},
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=60,  # 1 minute
    time_limit=120,  # 2 minutes hard limit
)
def delete_document_from_graph(self, data: dict) -> dict:
    """
    Delete a document from the Graphiti knowledge graph.

    This task removes all episodes, entities, and relationships
    associated with the document from Neo4j.

    Parameters
    ----------
    data : dict
        Task data containing:
        - documentId: Document identifier
        - userId: User identifier for validation

    Returns
    -------
    dict
        Result containing deleted_episodes, deleted_entities, deleted_edges
    """
    settings = get_graphiti_settings()

    if not settings.enabled:
        logger.info("Graphiti is disabled, skipping document deletion from graph")
        return {"status": "skipped", "reason": "graphiti_disabled"}

    document_id = data["documentId"]
    user_id = data["userId"]

    logger.info(
        "Deleting document from knowledge graph",
        document_id=document_id,
        user_id=user_id,
        retry=self.request.retries,
    )

    try:
        # Run the async deletion
        from graphrag import delete_document_from_graph as delete_doc

        result = _run_async(
            delete_doc(
                user_id=user_id,
                document_id=document_id,
            )
        )

        logger.info(
            "Document deleted from graph",
            document_id=document_id,
            deleted_episodes=result["deleted_episodes"],
            deleted_entities=result["deleted_entities"],
        )

        return {
            "status": "success",
            "deleted_episodes": result["deleted_episodes"],
            "deleted_entities": result["deleted_entities"],
            "deleted_edges": result["deleted_edges"],
        }

    except Exception as e:
        logger.error(
            "Failed to delete document from graph",
            document_id=document_id,
            error=str(e),
            exc_info=True,
        )
        raise
