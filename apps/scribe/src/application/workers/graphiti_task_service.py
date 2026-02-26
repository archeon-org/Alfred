from application.workers.async_utils import run_coroutine_sync
from application.workers.notification_payloads import (
    build_graphiti_failure_notification,
    build_graphiti_success_notification,
)
from application.workers.payloads import (
    GraphitiDeletePayload,
    GraphitiIngestPayload,
    parse_bulk_document,
    parse_reference_time,
)
from core.database import get_sync_session_factory
from core.logging import get_logger
from graphrag.config import get_graphiti_settings
from services.notification import get_notification_service

logger = get_logger(__name__)


class GraphitiTaskService:
    def __init__(self) -> None:
        self._session_factory = get_sync_session_factory()

    def ingest_document_to_graph(
        self,
        data: dict,
        retries: int,
        max_retries: int,
    ) -> dict:
        settings = get_graphiti_settings()
        payload = GraphitiIngestPayload.from_dict(data)
        if not settings.enabled:
            logger.info("Graphiti is disabled, skipping document ingestion")
            self._send_processing_notification(
                user_id=payload.user_id,
                document_id=payload.document_id,
                document_name=payload.document_name,
                node_count=0,
                edge_count=0,
                success=True,
                graphiti_disabled=True,
            )
            return {"status": "skipped", "reason": "graphiti_disabled"}

        logger.info(
            "Ingesting document to knowledge graph",
            document_id=payload.document_id,
            user_id=payload.user_id,
            document_name=payload.document_name,
            content_length=len(payload.content),
            retry=retries,
        )

        reference_time = parse_reference_time(payload.reference_time_raw)
        if payload.reference_time_raw and reference_time is None:
            logger.warning("Invalid reference time format", value=payload.reference_time_raw)
        try:
            from graphrag import ingest_document_episode

            result = run_coroutine_sync(
                ingest_document_episode(
                    user_id=payload.user_id,
                    document_name=payload.document_name,
                    content=payload.content,
                    document_id=payload.document_id,
                    reference_time=reference_time,
                )
            )
            logger.info(
                "Document ingested to graph successfully",
                document_id=payload.document_id,
                episode_uuid=result.get("episode_uuid"),
                node_count=result.get("node_count"),
                edge_count=result.get("edge_count"),
            )
            self._send_processing_notification(
                user_id=payload.user_id,
                document_id=payload.document_id,
                document_name=payload.document_name,
                node_count=result.get("node_count", 0),
                edge_count=result.get("edge_count", 0),
                success=True,
            )
            return {
                "status": "success",
                "document_id": payload.document_id,
                "episode_uuid": result.get("episode_uuid"),
                "node_count": result.get("node_count"),
                "edge_count": result.get("edge_count"),
            }
        except Exception as error:
            logger.error(
                "Failed to ingest document to graph",
                document_id=payload.document_id,
                error=str(error),
                retry_count=retries,
                exc_info=True,
            )
            if retries >= max_retries:
                self._send_processing_notification(
                    user_id=payload.user_id,
                    document_id=payload.document_id,
                    document_name=payload.document_name,
                    node_count=0,
                    edge_count=0,
                    success=False,
                    error_message=str(error),
                )
            else:
                logger.info(
                    "Skipping failure notification (will retry)",
                    document_id=payload.document_id,
                    retry=retries,
                    max_retries=max_retries,
                )
            raise

    def ingest_documents_bulk(self, data: dict, retries: int) -> dict:
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
            retry=retries,
        )
        try:
            parsed_docs = [parse_bulk_document(document) for document in documents]
            from graphrag import ingest_document_bulk

            result = run_coroutine_sync(
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
        except Exception as error:
            logger.error(
                "Failed bulk document ingestion",
                user_id=user_id,
                document_count=len(documents),
                error=str(error),
                exc_info=True,
            )
            raise

    def retrieve_context(self, data: dict) -> dict:
        settings = get_graphiti_settings()
        if not settings.enabled:
            return {"status": "skipped", "context": "", "reason": "graphiti_disabled"}
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

            context = run_coroutine_sync(
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
            return {"status": "success", "context": context}
        except Exception as error:
            logger.error(
                "Failed to retrieve context",
                user_id=user_id,
                error=str(error),
                exc_info=True,
            )
            return {"status": "error", "context": "", "error": str(error)}

    def initialize_graph(self) -> dict:
        settings = get_graphiti_settings()
        if not settings.enabled:
            return {"status": "skipped", "reason": "graphiti_disabled"}
        logger.info("Initializing Graphiti knowledge graph...")
        try:
            from graphrag import initialize_graphiti

            run_coroutine_sync(initialize_graphiti())
            logger.info("Graphiti initialization complete")
            return {"status": "success"}
        except Exception as error:
            logger.error("Failed to initialize Graphiti", error=str(error), exc_info=True)
            return {"status": "error", "error": str(error)}

    def delete_document_from_graph(self, data: dict, retries: int) -> dict:
        settings = get_graphiti_settings()
        payload = GraphitiDeletePayload.from_dict(data)
        if not settings.enabled:
            logger.info("Graphiti is disabled, skipping document deletion from graph")
            return {"status": "skipped", "reason": "graphiti_disabled"}
        logger.info(
            "Deleting document from knowledge graph",
            document_id=payload.document_id,
            user_id=payload.user_id,
            retry=retries,
        )
        try:
            from graphrag import delete_document_from_graph

            result = run_coroutine_sync(
                delete_document_from_graph(
                    user_id=payload.user_id,
                    document_id=payload.document_id,
                )
            )
            logger.info(
                "Document deleted from graph",
                document_id=payload.document_id,
                deleted_episodes=result["deleted_episodes"],
                deleted_entities=result["deleted_entities"],
            )
            return {
                "status": "success",
                "deleted_episodes": result["deleted_episodes"],
                "deleted_entities": result["deleted_entities"],
                "deleted_edges": result["deleted_edges"],
            }
        except Exception as error:
            logger.error(
                "Failed to delete document from graph",
                document_id=payload.document_id,
                error=str(error),
                exc_info=True,
            )
            raise

    def _send_processing_notification(
        self,
        user_id: str,
        document_id: str,
        document_name: str,
        node_count: int,
        edge_count: int,
        success: bool,
        error_message: str | None = None,
        graphiti_disabled: bool = False,
    ) -> None:
        session = self._session_factory()
        try:
            if success:
                get_notification_service().create(
                    session,
                    build_graphiti_success_notification(
                        user_id=user_id,
                        document_id=document_id,
                        document_name=document_name,
                        node_count=node_count,
                        edge_count=edge_count,
                        graphiti_disabled=graphiti_disabled,
                    ),
                )
            else:
                get_notification_service().create(
                    session,
                    build_graphiti_failure_notification(
                        user_id=user_id,
                        document_id=document_id,
                        document_name=document_name,
                        error_message=error_message,
                    ),
                )
            logger.info(
                "Sent processing notification",
                document_id=document_id,
                success=success,
                graphiti_disabled=graphiti_disabled,
            )
        except Exception as error:
            logger.error(
                "Failed to send processing notification",
                document_id=document_id,
                error=str(error),
            )
        finally:
            session.close()


_graphiti_task_service: GraphitiTaskService | None = None


def get_graphiti_task_service() -> GraphitiTaskService:
    global _graphiti_task_service
    if _graphiti_task_service is None:
        _graphiti_task_service = GraphitiTaskService()
    return _graphiti_task_service
