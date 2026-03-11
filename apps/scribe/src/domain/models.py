from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ProcessingStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class DocumentContext:
    document_id: str
    user_id: str
    storage_key: str
    original_name: str | None = None
    mimetype: str | None = None

    def __str__(self) -> str:
        return f"Document({self.document_id[:8]}...)"


@dataclass
class NewCategory:
    name: str
    icon: str
    color: str
    parent_category_id: str | None = None


@dataclass
class ClassificationResult:
    title: str
    category_id: str | None = None
    new_category: NewCategory | None = None
    tag_ids: list[str] = field(default_factory=list)
    confidence: str = "medium"
    reasoning: str = ""


@dataclass
class OCRResult:
    text: str
    page_count: int = 1
    method: str = "mistral"

    @property
    def char_count(self) -> int:
        return len(self.text)

    @property
    def is_empty(self) -> bool:
        return not self.text or len(self.text.strip()) < 50


@dataclass
class ProcessingResult:
    document_id: str
    content: str
    title: str
    category_id: str | None = None
    tag_ids: list[str] = field(default_factory=list)
    status: ProcessingStatus = ProcessingStatus.COMPLETED


@dataclass
class ProcessDocumentJob:
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
