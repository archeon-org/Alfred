from __future__ import annotations

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.orm import Session

from application.workers.async_utils import run_coroutine_sync
from application.workers.notification_payloads import (
    build_document_index_failed_notification,
    build_document_indexed_notification,
)
from application.workers.payloads import (
    BackfillDocumentsPayload,
    DeleteDocumentIndexPayload,
    IndexDocumentPayload,
)
from core.config import get_settings
from core.database import get_sync_session_factory
from core.logging import get_logger
from rag.orchestrators import IngestionOrchestrator
from rag.repositories.chunk_repository import ChunkRepository
from services.credit import CreditOperation, get_credit_service
from services.notification import get_notification_service

logger = get_logger(__name__)


class RagTaskService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._session_factory = get_sync_session_factory()
        self._ingestion_orchestrator = IngestionOrchestrator()

    def index_document(
        self,
        *,
        data: dict,
        retries: int,
        max_retries: int,
    ) -> dict[str, object]:
        payload = IndexDocumentPayload.from_dict(data)
        session = self._session_factory()

        logger.info(
            "Indexing document",
            document_id=payload.document_id,
            user_id=payload.user_id,
            manual_trigger=payload.manual_trigger,
            bulk_operation_id=payload.bulk_operation_id,
            suppress_notifications=payload.suppress_notifications,
            retries=retries,
            max_retries=max_retries,
            worker_host=self._settings.worker_host,
        )

        try:
            result = run_coroutine_sync(
                self._ingestion_orchestrator.run(
                    session=session,
                    document_id=payload.document_id,
                    user_id=payload.user_id,
                )
            )

            if not payload.suppress_notifications:
                self._send_index_success_notification(
                    payload=payload,
                    result=result,
                    session=session,
                )

            return {"status": "completed", **result}

        except SoftTimeLimitExceeded as error:
            self._handle_index_failure(
                session=session,
                payload=payload,
                error_message="Indexing timeout",
                is_final=True,
                suppress_notification=payload.suppress_notifications,
            )
            raise error
        except Exception as error:
            self._handle_index_failure(
                session=session,
                payload=payload,
                error_message=str(error),
                is_final=retries >= max_retries,
                suppress_notification=payload.suppress_notifications,
            )
            raise
        finally:
            session.close()

    def delete_document_index(self, *, data: dict, retries: int) -> dict[str, object]:
        payload = DeleteDocumentIndexPayload.from_dict(data)
        session = self._session_factory()
        try:
            repository = ChunkRepository(session)
            deleted = repository.delete_document_chunks(
                document_id=payload.document_id,
                user_id=payload.user_id,
            )
            logger.info(
                "Deleted document index",
                document_id=payload.document_id,
                user_id=payload.user_id,
                deleted=deleted,
                retries=retries,
            )
            return {
                "status": "completed",
                "document_id": payload.document_id,
                "user_id": payload.user_id,
                "deleted": deleted,
            }
        finally:
            session.close()

    def backfill_documents(self, *, data: dict) -> dict[str, object]:
        payload = BackfillDocumentsPayload.from_dict(data)
        session = self._session_factory()

        try:
            repository = ChunkRepository(session)
            candidates = repository.fetch_backfill_candidates(payload.batch_size)
            queued = 0

            from tasks.rag import index_document

            for document_id, user_id in candidates:
                index_document.delay(  # type: ignore[attr-defined]
                    {
                        "documentId": document_id,
                        "userId": user_id,
                        "manualTrigger": False,
                    }
                )
                queued += 1

            logger.info(
                "Backfill queued",
                requested_by=payload.requested_by,
                requested_batch=payload.batch_size,
                queued=queued,
            )
            return {
                "status": "queued",
                "requested_by": payload.requested_by,
                "queued": queued,
                "batch_size": payload.batch_size,
            }
        finally:
            session.close()

    def _handle_index_failure(
        self,
        *,
        session: Session,
        payload: IndexDocumentPayload,
        error_message: str,
        is_final: bool,
        suppress_notification: bool,
    ) -> None:
        logger.error(
            "Document indexing failed",
            document_id=payload.document_id,
            user_id=payload.user_id,
            error=error_message,
            is_final=is_final,
            manual_trigger=payload.manual_trigger,
            bulk_operation_id=payload.bulk_operation_id,
            suppress_notifications=suppress_notification,
        )

        if not is_final:
            return

        try:
            session.rollback()

            refunded = False
            if payload.manual_trigger:
                get_credit_service().refund_credits(
                    session,
                    payload.user_id,
                    CreditOperation.AI_EMBEDDING,
                    f"Document indexing failed: {error_message}",
                )
                refunded = True

            if not suppress_notification:
                get_notification_service().create(
                    session,
                    build_document_index_failed_notification(
                        user_id=payload.user_id,
                        document_id=payload.document_id,
                        refunded=refunded,
                    ),
                )
        except Exception as failure_error:
            logger.error(
                "Failed to handle document index failure",
                document_id=payload.document_id,
                user_id=payload.user_id,
                error=str(failure_error),
            )

    def _send_index_success_notification(
        self,
        *,
        payload: IndexDocumentPayload,
        result: dict[str, object],
        session: Session,
    ) -> None:
        try:
            get_notification_service().create(
                session,
                build_document_indexed_notification(
                    user_id=payload.user_id,
                    document_id=payload.document_id,
                    chunk_count=int(result.get("total_chunks", 0)),
                ),
            )
        except Exception as notify_error:
            logger.error(
                "Failed to send index success notification",
                document_id=payload.document_id,
                user_id=payload.user_id,
                manual_trigger=payload.manual_trigger,
                error=str(notify_error),
            )


_rag_task_service: RagTaskService | None = None


def get_rag_task_service() -> RagTaskService:
    global _rag_task_service
    if _rag_task_service is None:
        _rag_task_service = RagTaskService()
    return _rag_task_service
