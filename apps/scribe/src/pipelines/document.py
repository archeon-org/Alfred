from dataclasses import dataclass
from sqlalchemy.orm import Session

from core.logging import get_logger
from domain.models import ProcessingStatus, ProcessingResult, ClassificationResult
from repositories.document import DocumentRepository
from services.r2 import get_r2_service
from services.ocr import get_ocr_service
from services.classification import get_classification_service

logger = get_logger(__name__)


@dataclass
class DocumentJob:
    document_id: str
    user_id: str
    r2_key: str
    original_name: str | None


class DocumentPipeline:
    def __init__(self, session: Session):
        self._session = session
        self._repository = DocumentRepository(session)

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

        self._queue_graph_ingestion(
            job.document_id,
            job.user_id,
            classification.title or job.original_name or "Untitled",
            text_content,
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
        return self._r2_service.get_file(key)

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
        categories: list[dict[str, str]],
        tags: list[dict[str, str]],
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
            return self._repository.create_category(user_id, nc.name, nc.icon, nc.color)

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

    def _queue_graph_ingestion(
        self,
        document_id: str,
        user_id: str,
        document_name: str,
        content: str,
    ) -> None:
        logger.info("Queueing graph ingestion", document_id=document_id)
        try:
            from tasks.graphiti import ingest_document_to_graph

            ingest_document_to_graph.delay(  # type: ignore[attr-defined]
                {
                    "documentId": document_id,
                    "userId": user_id,
                    "documentName": document_name,
                    "content": content,
                    "referenceTime": None,
                }
            )
        except Exception as e:
            logger.warning(
                "Failed to queue graph ingestion",
                document_id=document_id,
                error=str(e),
            )

    def mark_failed(self, document_id: str) -> None:
        self._repository.mark_failed(document_id)
