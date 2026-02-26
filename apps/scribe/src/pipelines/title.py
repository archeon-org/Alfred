from dataclasses import dataclass
from sqlalchemy.orm import Session

from core.logging import get_logger
from repositories.document import DocumentRepository
from services.r2 import get_r2_service
from services.ocr import get_ocr_service
from services.classification import get_classification_service

logger = get_logger(__name__)


@dataclass
class TitleJob:
    document_id: str
    user_id: str
    r2_key: str
    original_name: str | None


@dataclass
class TitleResult:
    document_id: str
    title: str


class TitlePipeline:
    def __init__(self, session: Session):
        self._session = session
        self._repository = DocumentRepository(session)

        self._r2_service = None
        self._ocr_service = None
        self._classification_service = None

    def process(self, job: TitleJob) -> TitleResult:
        logger.info("Starting title pipeline", document_id=job.document_id)

        text_content = self._get_content(job)

        title = self._generate_title(text_content, job.original_name)

        self._repository.update_title(job.document_id, title)

        logger.info("Title pipeline completed", document_id=job.document_id, title=title)

        return TitleResult(document_id=job.document_id, title=title)

    def _get_content(self, job: TitleJob) -> str:
        content = self._repository.get_content(job.document_id)

        if content:
            return content

        logger.info("No content found, performing OCR", document_id=job.document_id)

        if not self._r2_service:
            self._r2_service = get_r2_service()
        if not self._ocr_service:
            self._ocr_service = get_ocr_service()

        file_data = self._r2_service.get_file(job.r2_key)
        text_content = self._ocr_service.recognize(file_data)

        self._repository.update_content(job.document_id, text_content)

        return text_content

    def _generate_title(self, content: str, original_name: str | None) -> str:
        if not self._classification_service:
            self._classification_service = get_classification_service()

        result = self._classification_service.generate_title(content, original_name)
        return result.title
