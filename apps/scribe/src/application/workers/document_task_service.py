from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy.orm import Session

from application.workers.notification_payloads import (
    build_bulk_processing_summary_notification,
    build_document_processing_failed_notification,
    build_title_failed_notification,
    build_title_generated_notification,
)
from application.workers.payloads import (
    BulkDocumentTaskPayload,
    DocumentTaskPayload,
    TitleTaskPayload,
)
from core.config import get_settings
from core.database import get_sync_session_factory
from core.logging import get_logger
from pipelines.document import DocumentJob, DocumentPipeline
from pipelines.title import TitleJob, TitlePipeline
from services.credit import CreditOperation, get_credit_service
from services.notification import get_notification_service

logger = get_logger(__name__)


class DocumentTaskService:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._session_factory = get_sync_session_factory()

    def process_document(
        self,
        data: dict,
        retries: int,
        max_retries: int,
    ) -> None:
        payload = DocumentTaskPayload.from_dict(data)
        is_retry = retries > 0
        logger.info(
            "Processing document",
            document_id=payload.document_id,
            user_id=payload.user_id,
            is_retry=is_retry,
            worker_host=self._settings.worker_host,
        )
        session = self._session_factory()
        try:
            pipeline = DocumentPipeline(session)
            if is_retry and pipeline.is_already_processed(payload.document_id):
                logger.info("Document already processed, skipping", document_id=payload.document_id)
                return
            pipeline.process(
                DocumentJob(
                    document_id=payload.document_id,
                    user_id=payload.user_id,
                    r2_key=payload.key,
                    original_name=payload.original_name,
                    bulk_operation_id=payload.bulk_operation_id,
                    suppress_notifications=payload.suppress_notifications,
                )
            )
        except SoftTimeLimitExceeded:
            logger.error("Task soft time limit exceeded", document_id=payload.document_id)
            self._handle_processing_failure(
                session=session,
                document_id=payload.document_id,
                user_id=payload.user_id,
                error_message="Processing timeout",
                is_final=True,
                suppress_notification=payload.suppress_notifications,
            )
            raise
        except Exception as error:
            logger.error(
                "Document processing failed",
                document_id=payload.document_id,
                error=str(error),
            )
            self._handle_processing_failure(
                session=session,
                document_id=payload.document_id,
                user_id=payload.user_id,
                error_message=str(error),
                is_final=retries >= max_retries,
                suppress_notification=payload.suppress_notifications,
            )
            raise
        finally:
            session.close()

    def process_documents_bulk(self, data: dict) -> dict[str, object]:
        payload = BulkDocumentTaskPayload.from_dict(data)
        total = len(payload.documents)
        succeeded = 0
        failed = 0
        skipped = 0

        logger.info(
            "Processing documents in bulk",
            user_id=payload.user_id,
            total=total,
            bulk_operation_id=payload.bulk_operation_id,
            suppress_per_document_notifications=payload.suppress_per_document_notifications,
        )

        for item in payload.documents:
            session = self._session_factory()
            try:
                pipeline = DocumentPipeline(session)
                if pipeline.is_already_processed(item.document_id):
                    skipped += 1
                    logger.info(
                        "Document already processed, skipping bulk item",
                        document_id=item.document_id,
                    )
                    continue

                pipeline.process(
                    DocumentJob(
                        document_id=item.document_id,
                        user_id=item.user_id,
                        r2_key=item.key,
                        original_name=item.original_name,
                        bulk_operation_id=payload.bulk_operation_id,
                        suppress_notifications=payload.suppress_per_document_notifications,
                    )
                )
                succeeded += 1
            except SoftTimeLimitExceeded:
                failed += 1
                logger.error(
                    "Bulk processing soft time limit exceeded",
                    document_id=item.document_id,
                )
                self._handle_processing_failure(
                    session=session,
                    document_id=item.document_id,
                    user_id=item.user_id,
                    error_message="Processing timeout",
                    is_final=True,
                    suppress_notification=payload.suppress_per_document_notifications,
                )
                break
            except Exception as error:
                failed += 1
                logger.error(
                    "Bulk document processing failed",
                    document_id=item.document_id,
                    error=str(error),
                )
                self._handle_processing_failure(
                    session=session,
                    document_id=item.document_id,
                    user_id=item.user_id,
                    error_message=str(error),
                    is_final=True,
                    suppress_notification=payload.suppress_per_document_notifications,
                )
            finally:
                session.close()

        if payload.notify_summary:
            self._send_bulk_processing_summary(
                user_id=payload.user_id,
                total=total,
                succeeded=succeeded,
                failed=failed,
                skipped=skipped,
                bulk_operation_id=payload.bulk_operation_id,
            )

        return {
            "status": "completed",
            "user_id": payload.user_id,
            "bulk_operation_id": payload.bulk_operation_id,
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "skipped": skipped,
        }

    def generate_title(self, data: dict) -> None:
        payload = TitleTaskPayload.from_dict(data)
        logger.info("Generating title", document_id=payload.document_id, user_id=payload.user_id)
        session = self._session_factory()
        try:
            pipeline = TitlePipeline(session)
            result = pipeline.process(
                TitleJob(
                    document_id=payload.document_id,
                    user_id=payload.user_id,
                    r2_key=payload.key,
                    original_name=payload.original_name,
                )
            )
            get_notification_service().create(
                session,
                build_title_generated_notification(
                    user_id=payload.user_id,
                    document_id=payload.document_id,
                    title=result.title,
                ),
            )
        except Exception as error:
            logger.error(
                "Title generation failed",
                document_id=payload.document_id,
                error=str(error),
            )
            self._handle_title_failure(
                session=session,
                document_id=payload.document_id,
                user_id=payload.user_id,
                error_message=str(error),
            )
            raise
        finally:
            session.close()

    def _handle_processing_failure(
        self,
        session: Session,
        document_id: str,
        user_id: str,
        error_message: str,
        is_final: bool,
        suppress_notification: bool = False,
    ) -> None:
        try:
            session.rollback()

            from repositories.document import DocumentRepository

            repository = DocumentRepository(session)
            repository.mark_failed(document_id)
            get_credit_service().refund_credits(
                session,
                user_id,
                CreditOperation.AI_CLASSIFICATION,
                f"Document processing failed: {error_message}",
            )
            if is_final and not suppress_notification:
                get_notification_service().create(
                    session,
                    build_document_processing_failed_notification(
                        user_id=user_id,
                        document_id=document_id,
                    ),
                )
                logger.info("Sent final failure notification", document_id=document_id)
            elif is_final and suppress_notification:
                logger.info(
                    "Suppressed per-document failure notification",
                    document_id=document_id,
                )
            else:
                logger.info("Skipping failure notification (will retry)", document_id=document_id)
        except Exception as error:
            logger.error(
                "Failed to handle processing failure",
                document_id=document_id,
                error=str(error),
            )

    def _send_bulk_processing_summary(
        self,
        *,
        user_id: str,
        total: int,
        succeeded: int,
        failed: int,
        skipped: int,
        bulk_operation_id: str | None,
    ) -> None:
        session = self._session_factory()
        try:
            get_notification_service().create(
                session,
                build_bulk_processing_summary_notification(
                    user_id=user_id,
                    total=total,
                    succeeded=succeeded,
                    failed=failed,
                    bulk_operation_id=bulk_operation_id,
                ),
            )
            logger.info(
                "Sent bulk processing summary notification",
                user_id=user_id,
                bulk_operation_id=bulk_operation_id,
                total=total,
                succeeded=succeeded,
                failed=failed,
                skipped=skipped,
            )
        except Exception as error:
            logger.error(
                "Failed to send bulk processing summary notification",
                user_id=user_id,
                bulk_operation_id=bulk_operation_id,
                error=str(error),
            )
        finally:
            session.close()

    def _handle_title_failure(
        self,
        session: Session,
        document_id: str,
        user_id: str,
        error_message: str,
    ) -> None:
        try:
            session.rollback()

            get_credit_service().refund_credits(
                session,
                user_id,
                CreditOperation.AI_TITLE_GENERATION,
                f"Title generation failed: {error_message}",
            )
            get_notification_service().create(
                session,
                build_title_failed_notification(
                    user_id=user_id,
                    document_id=document_id,
                ),
            )
        except Exception as error:
            logger.error(
                "Failed to handle title failure",
                document_id=document_id,
                error=str(error),
            )


_document_task_service: DocumentTaskService | None = None


def get_document_task_service() -> DocumentTaskService:
    global _document_task_service
    if _document_task_service is None:
        _document_task_service = DocumentTaskService()
    return _document_task_service
