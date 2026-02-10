"""
Document Processing Tasks

Celery tasks that act as thin wrappers around pipelines.
Following SOLID: Tasks handle only Celery concerns, pipelines handle business logic.
"""

from celery.exceptions import SoftTimeLimitExceeded

from core.celery_app import celery_app
from core.config import get_settings
from core.database import get_sync_session_factory
from core.logging import get_logger
from domain.models import ProcessingStatus
from pipelines.document import DocumentPipeline, DocumentJob
from pipelines.title import TitlePipeline, TitleJob
from services.notification import (
    get_notification_service,
    CreateNotificationDTO,
    NotificationType,
)
from services.credit import (
    get_credit_service,
    CreditOperation,
)

logger = get_logger(__name__)
settings = get_settings()


# =============================================================================
# Main Document Processing Task
# =============================================================================


@celery_app.task(
    name="scribe.tasks.document.process_document",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
    reject_on_worker_lost=True,
)
def process_document(self, data: dict) -> None:
    """
    Process a document: OCR, classify, and queue knowledge graph ingestion.

    This task is a thin wrapper that:
    1. Extracts job parameters from data dict
    2. Delegates to DocumentPipeline
    3. Handles errors with notifications and refunds
    """
    document_id = data["documentId"]
    user_id = data["userId"]
    key = data["key"]
    original_name = data.get("originalName")
    is_retry = self.request.retries > 0

    logger.info(
        "Processing document",
        document_id=document_id,
        user_id=user_id,
        is_retry=is_retry,
        worker_host=settings.worker_host,
    )

    session_factory = get_sync_session_factory()
    session = session_factory()

    try:
        pipeline = DocumentPipeline(session)

        # Check if already processed (for retries)
        if is_retry and pipeline.is_already_processed(document_id):
            logger.info("Document already processed, skipping", document_id=document_id)
            return

        # Execute pipeline
        job = DocumentJob(
            document_id=document_id,
            user_id=user_id,
            r2_key=key,
            original_name=original_name,
        )
        pipeline.process(job)

    except SoftTimeLimitExceeded:
        logger.error("Task soft time limit exceeded", document_id=document_id)
        # Timeout is final - no retry for this
        _handle_failure(session, document_id, user_id, "Processing timeout", is_final=True)
        raise

    except Exception as e:
        logger.error("Document processing failed", document_id=document_id, error=str(e))
        # Only send notification on final retry
        max_retries = self.max_retries or 1
        is_final = self.request.retries >= max_retries
        _handle_failure(session, document_id, user_id, str(e), is_final=is_final)
        raise

    finally:
        session.close()


# =============================================================================
# Title Generation Task
# =============================================================================


@celery_app.task(
    name="scribe.tasks.document.generate_title",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=5,
    retry_kwargs={"max_retries": 1},
    acks_late=True,
)
def generate_title(self, data: dict) -> None:
    """
    Generate a title for a document using AI.

    This task is a thin wrapper that:
    1. Extracts job parameters from data dict
    2. Delegates to TitlePipeline
    3. Sends success/failure notifications
    """
    document_id = data["documentId"]
    user_id = data["userId"]
    key = data["key"]
    original_name = data.get("originalName")

    logger.info("Generating title", document_id=document_id, user_id=user_id)

    session_factory = get_sync_session_factory()
    session = session_factory()

    try:
        pipeline = TitlePipeline(session)

        job = TitleJob(
            document_id=document_id,
            user_id=user_id,
            r2_key=key,
            original_name=original_name,
        )
        result = pipeline.process(job)

        # Send success notification
        notification_service = get_notification_service()
        notification_service.create(
            session,
            CreateNotificationDTO(
                user_id=user_id,
                title="Title Generated",
                message=f'Your document has been renamed to "{result.title}".',
                redirect=f"/(app)/documents/{document_id}",
                notification_type=NotificationType.TITLE_GENERATED,
                data={"documentId": document_id},
            ),
        )

    except Exception as e:
        logger.error("Title generation failed", document_id=document_id, error=str(e))
        _handle_title_failure(session, document_id, user_id, str(e))
        raise

    finally:
        session.close()


# =============================================================================
# Error Handlers
# =============================================================================


def _handle_failure(
    session,
    document_id: str,
    user_id: str,
    error_message: str,
    is_final: bool = False,
) -> None:
    """
    Handle document processing failure: update status, refund credits, and optionally notify.

    Parameters
    ----------
    session : Session
        Database session
    document_id : str
        Document that failed
    user_id : str
        User who owns the document
    error_message : str
        Error description
    is_final : bool
        If True, this is the final attempt (no more retries) - send notification.
        If False, task will retry - skip notification to avoid spam.
    """
    try:
        from repositories.document import DocumentRepository
        from domain.models import ProcessingStatus

        repository = DocumentRepository(session)
        repository.mark_failed(document_id)

        # Refund credits
        credit_service = get_credit_service()
        credit_service.refund_credits(
            session,
            user_id,
            CreditOperation.AI_CLASSIFICATION,
            f"Document processing failed: {error_message}",
        )

        # Only send notification on FINAL failure (no more retries)
        # This prevents notification spam during intermediate retry attempts
        if is_final:
            notification_service = get_notification_service()
            notification_service.create(
                session,
                CreateNotificationDTO(
                    user_id=user_id,
                    title="Document Processing Failed",
                    message="There was an error processing your document. Your credits have been refunded.",
                    redirect=f"/(app)/documents/{document_id}",
                    notification_type=NotificationType.DOCUMENT_ERROR,
                    data={"documentId": document_id},
                ),
            )
            logger.info("Sent final failure notification", document_id=document_id)
        else:
            logger.info("Skipping failure notification (will retry)", document_id=document_id)

    except Exception as e:
        logger.error("Failed to handle processing failure", document_id=document_id, error=str(e))


def _handle_title_failure(
    session,
    document_id: str,
    user_id: str,
    error_message: str,
) -> None:
    """Handle title generation failure: refund and notify."""
    try:
        # Refund credits
        credit_service = get_credit_service()
        credit_service.refund_credits(
            session,
            user_id,
            CreditOperation.AI_TITLE_GENERATION,
            f"Title generation failed: {error_message}",
        )

        # Send failure notification
        notification_service = get_notification_service()
        notification_service.create(
            session,
            CreateNotificationDTO(
                user_id=user_id,
                title="Title Generation Failed",
                message="There was an error generating a title. Your credits have been refunded.",
                redirect=f"/(app)/documents/{document_id}",
                notification_type=NotificationType.DOCUMENT_ERROR,
                data={"documentId": document_id},
            ),
        )

    except Exception as e:
        logger.error("Failed to handle title failure", document_id=document_id, error=str(e))
