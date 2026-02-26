from dataclasses import dataclass
from datetime import datetime
from typing import Any

Payload = dict[str, Any]


@dataclass(frozen=True, slots=True)
class DocumentTaskPayload:
    document_id: str
    user_id: str
    key: str
    original_name: str | None

    @classmethod
    def from_dict(cls, data: Payload) -> "DocumentTaskPayload":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            key=data["key"],
            original_name=data.get("originalName"),
        )


@dataclass(frozen=True, slots=True)
class TitleTaskPayload:
    document_id: str
    user_id: str
    key: str
    original_name: str | None

    @classmethod
    def from_dict(cls, data: Payload) -> "TitleTaskPayload":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            key=data["key"],
            original_name=data.get("originalName"),
        )


@dataclass(frozen=True, slots=True)
class GraphitiIngestPayload:
    document_id: str
    user_id: str
    document_name: str
    content: str
    reference_time_raw: str | None

    @classmethod
    def from_dict(cls, data: Payload) -> "GraphitiIngestPayload":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            document_name=data["documentName"],
            content=data["content"],
            reference_time_raw=data.get("referenceTime"),
        )


@dataclass(frozen=True, slots=True)
class GraphitiDeletePayload:
    document_id: str
    user_id: str

    @classmethod
    def from_dict(cls, data: Payload) -> "GraphitiDeletePayload":
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
        )


def parse_reference_time(reference_time_raw: str | None) -> datetime | None:
    if not reference_time_raw:
        return None
    try:
        return datetime.fromisoformat(reference_time_raw)
    except ValueError:
        return None


def parse_bulk_document(document: Payload) -> Payload:
    parsed_document: Payload = {"name": document["name"], "content": document["content"]}
    reference_time_raw = document.get("referenceTime")
    if not isinstance(reference_time_raw, str):
        return parsed_document
    try:
        parsed_document["reference_time"] = datetime.fromisoformat(reference_time_raw)
    except ValueError:
        return parsed_document
    return parsed_document
