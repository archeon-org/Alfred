"""
Document Processing Pipeline

Single Responsibility: Orchestrate the document processing workflow.
Open/Closed: Easy to add new steps without modifying existing code.
KISS: Clear linear flow, each step is a simple method.
"""

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
    """Input for document processing pipeline."""

    document_id: str
    user_id: str
    r2_key: str
    original_name: str | None


class DocumentPipeline:
    """
    Orchestrates the document processing workflow.

    Pipeline steps:
    1. Download file from R2
    2. Perform OCR
    3. Fetch user taxonomy
    4. AI classification
    5. Update database
    6. Queue graph ingestion

    Single Responsibility: Only orchestrates, doesn't implement steps.
    Dependency Injection: Services are injected/created at runtime.
    """

    def __init__(self, session: Session):
        self._session = session
        self._repository = DocumentRepository(session)

        # Services are singletons, get them lazily
        self._r2_service = None
        self._ocr_service = None
        self._classification_service = None

    def is_already_processed(self, document_id: str) -> bool:
        """Check if document was already processed (for retry handling)."""
        return self._repository.is_already_processed(document_id)

    def process(self, job: DocumentJob) -> ProcessingResult:
        """
        Execute the full document processing pipeline.

        Args:
            job: Document processing job data

        Returns:
            ProcessingResult with extracted content and classification

        Raises:
            Exception: If any step fails
        """
        logger.info("Starting document pipeline", document_id=job.document_id)

        # Mark as processing
        self._repository.update_status(job.document_id, ProcessingStatus.PROCESSING)

        # Step 1: Download file
        file_data = self._download_file(job.r2_key)

        # Step 2: Extract text via OCR
        mimetype = self._repository.get_mimetype(job.document_id)
        text_content = self._extract_text(file_data, mimetype)

        # Step 3: Get user's taxonomy
        taxonomy = self._repository.get_user_taxonomy(job.user_id)

        # Step 4: AI classification
        classification = self._classify_document(
            text_content,
            taxonomy.categories,
            taxonomy.tags,
            job.original_name,
        )

        # Step 5: Handle new category if suggested
        final_category_id = self._resolve_category(job.user_id, classification)

        # Step 6: Update document in database
        self._save_results(
            job.document_id,
            text_content,
            classification.title,
            final_category_id,
            classification.tag_ids,
        )

        # Step 7: Queue graph ingestion
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

    # ========================================================================
    # Pipeline Steps (private methods)
    # ========================================================================

    def _download_file(self, key: str) -> bytes:
        """Step 1: Download file from R2."""
        logger.info("Downloading file from R2", key=key)
        if not self._r2_service:
            self._r2_service = get_r2_service()
        return self._r2_service.get_file(key)

    def _extract_text(self, file_data: bytes, mimetype: str | None) -> str:
        """Step 2: Extract text via OCR."""
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
        """Step 4: AI classification."""
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
        """Step 5: Resolve category (use existing or create new)."""
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
        """Step 6: Save all results to database."""
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
        """Step 7: Queue knowledge graph ingestion."""
        logger.info("Queueing graph ingestion", document_id=document_id)
        try:
            from tasks.graphiti import ingest_document_to_graph

            ingest_document_to_graph.delay(
                {
                    "documentId": document_id,
                    "userId": user_id,
                    "documentName": document_name,
                    "content": content,
                    "referenceTime": None,
                }
            )
        except Exception as e:
            # Log but don't fail - graph ingestion is secondary
            logger.warning(
                "Failed to queue graph ingestion",
                document_id=document_id,
                error=str(e),
            )

    def mark_failed(self, document_id: str) -> None:
        """Mark document as failed in database."""
        self._repository.mark_failed(document_id)
