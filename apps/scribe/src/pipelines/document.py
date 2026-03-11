from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.config import get_settings
from core.logging import get_logger
from domain.models import ClassificationResult, ProcessingResult, ProcessingStatus
from repositories.document import DocumentRepository
from services.classification import get_classification_service
from services.ocr import get_ocr_service
from services.r2 import get_r2_service

logger = get_logger(__name__)


@dataclass
class DocumentJob:
    document_id: str
    user_id: str
    r2_key: str
    original_name: str | None
    bulk_operation_id: str | None = None
    suppress_notifications: bool = False


class DocumentPipeline:
    def __init__(self, session: Session):
        settings = get_settings()
        self._session = session
        self._repository = DocumentRepository(session)
        self._max_file_size = settings.max_request_size

        self._r2_service = None
        self._ocr_service = None
        self._classification_service = None

    def is_already_processed(self, document_id: str) -> bool:
        return self._repository.is_already_processed(document_id)

    def process(self, job: DocumentJob) -> ProcessingResult:
        logger.info("Starting document pipeline", document_id=job.document_id)

        self._repository.update_status(job.document_id, ProcessingStatus.PROCESSING)

        file_data = self._download_file(job.r2_key)

        mimetype = self._repository.get_mimetype(job.document_id)
        text_content = self._extract_text(file_data, mimetype)

        taxonomy = self._repository.get_user_taxonomy(job.user_id)

        classification = self._classify_document(
            text_content,
            taxonomy.categories,
            taxonomy.tags,
            job.original_name,
        )

        final_category_id = self._resolve_category(job.user_id, classification)

        self._save_results(
            job.document_id,
            text_content,
            classification.title,
            final_category_id,
            classification.tag_ids,
        )

        self._queue_document_indexing(
            job.document_id,
            job.user_id,
            bulk_operation_id=job.bulk_operation_id,
            suppress_notifications=job.suppress_notifications,
        )

        logger.info(
            "Document pipeline completed",
            document_id=job.document_id,
            title=classification.title,
        )

        return ProcessingResult(
            document_id=job.document_id,
            content=text_content,
            title=classification.title,
            category_id=final_category_id,
            tag_ids=classification.tag_ids,
            status=ProcessingStatus.COMPLETED,
        )

    def _download_file(self, key: str) -> bytes:
        logger.info("Downloading file from R2", key=key)
        if not self._r2_service:
            self._r2_service = get_r2_service()
        file_data = self._r2_service.get_file(key)
        if len(file_data) > self._max_file_size:
            raise ValueError(
                f"Document exceeds max size of {self._max_file_size} bytes "
                f"(received {len(file_data)} bytes)"
            )
        return file_data

    def _extract_text(self, file_data: bytes, mimetype: str | None) -> str:
        logger.info("Performing OCR", mimetype=mimetype)
        if not self._ocr_service:
            self._ocr_service = get_ocr_service()

        text_content = self._ocr_service.recognize(file_data, mimetype=mimetype)
        logger.info("OCR completed", chars=len(text_content))
        return text_content

    def _classify_document(
        self,
        content: str,
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
        original_name: str | None,
    ) -> ClassificationResult:
        logger.info("Starting AI classification")
        if not self._classification_service:
            self._classification_service = get_classification_service()

        return self._classification_service.classify_document(
            content, categories, tags, original_name
        )

    def _resolve_category(
        self,
        user_id: str,
        classification: ClassificationResult,
    ) -> str | None:
        if classification.category_id:
            return classification.category_id

        if classification.new_category:
            nc = classification.new_category
            logger.info("Creating new category", name=nc.name)
            return self._repository.create_category(
                user_id,
                nc.name,
                nc.icon,
                nc.color,
                parent_id=nc.parent_category_id,
            )

        return None

    def _save_results(
        self,
        document_id: str,
        content: str,
        title: str,
        category_id: str | None,
        tag_ids: list[str],
    ) -> None:
        logger.info("Saving results", document_id=document_id)

        self._repository.complete_processing(document_id, content, title, category_id)

        if tag_ids:
            self._repository.update_tags(document_id, tag_ids)

    def _queue_document_indexing(
        self,
        document_id: str,
        user_id: str,
        bulk_operation_id: str | None = None,
        suppress_notifications: bool = False,
    ) -> None:
        logger.info("Queueing document indexing", document_id=document_id)
        try:
            from tasks.rag import index_document

            index_document.delay(  # type: ignore[attr-defined]
                {
                    "documentId": document_id,
                    "userId": user_id,
                    "manualTrigger": False,
                    "bulkOperationId": bulk_operation_id,
                    "suppressNotifications": suppress_notifications,
                }
            )
        except Exception as e:
            logger.warning(
                "Failed to queue document indexing",
                document_id=document_id,
                error=str(e),
            )

    def mark_failed(self, document_id: str) -> None:
        self._repository.mark_failed(document_id)
