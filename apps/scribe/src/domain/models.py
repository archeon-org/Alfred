"""
Domain Models

Value objects and DTOs for the document processing pipeline.
These are pure data containers with no external dependencies.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ProcessingStatus(str, Enum):
    """Document processing status (matches PostgreSQL enum)."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class DocumentContext:
    """
    Immutable context for document processing.

    Contains all information needed to process a document.
    Created once at the start of the pipeline and passed through.
    """

    document_id: str
    user_id: str
    storage_key: str
    original_name: str | None = None
    mimetype: str | None = None

    def __str__(self) -> str:
        return f"Document({self.document_id[:8]}...)"


@dataclass
class NewCategory:
    """Suggested new category from AI classification."""

    name: str
    icon: str  # Ionicons icon name
    color: str  # Hex color code


@dataclass
class ClassificationResult:
    """Result of AI document classification."""

    title: str
    category_id: str | None = None
    new_category: NewCategory | None = None
    tag_ids: list[str] = field(default_factory=list)
    confidence: str = "medium"
    reasoning: str = ""


@dataclass
class OCRResult:
    """Result of OCR text extraction."""

    text: str
    page_count: int = 1
    method: str = "tesseract"  # "embedded", "tesseract"

    @property
    def char_count(self) -> int:
        return len(self.text)

    @property
    def is_empty(self) -> bool:
        return not self.text or len(self.text.strip()) < 50


@dataclass
class ProcessingResult:
    """Final result of document processing pipeline."""

    document_id: str
    content: str
    title: str
    category_id: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    status: ProcessingStatus = ProcessingStatus.COMPLETED


# ============================================================================
# Job Data (matches TypeScript interfaces from Gate)
# ============================================================================


@dataclass
class ProcessDocumentJob:
    """Job data for document processing task."""

    document_id: str
    user_id: str
    key: str
    original_name: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProcessDocumentJob":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            key=data["key"],
            original_name=data.get("originalName"),
        )


@dataclass
class GraphIngestionJob:
    """Job data for knowledge graph ingestion task."""

    document_id: str
    user_id: str
    document_name: str
    content: str
    reference_time: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "GraphIngestionJob":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            document_name=data["documentName"],
            content=data["content"],
            reference_time=data.get("referenceTime"),
        )
