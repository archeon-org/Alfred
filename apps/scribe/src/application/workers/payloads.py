from __future__ import annotations

from dataclasses import dataclass
from typing import Any

Payload = dict[str, Any]


@dataclass(frozen=True, slots=True)
class DocumentTaskPayload:
    document_id: str
    user_id: str
    key: str
    original_name: str | None
    bulk_operation_id: str | None
    suppress_notifications: bool

    @classmethod
    def from_dict(cls, data: Payload) -> DocumentTaskPayload:
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            key=data["key"],
            original_name=data.get("originalName"),
            bulk_operation_id=data.get("bulkOperationId"),
            suppress_notifications=bool(data.get("suppressNotifications", False)),
        )


@dataclass(frozen=True, slots=True)
class BulkDocumentTaskPayload:
    user_id: str
    documents: list[DocumentTaskPayload]
    bulk_operation_id: str | None
    notify_summary: bool
    suppress_per_document_notifications: bool

    @classmethod
    def from_dict(cls, data: Payload) -> BulkDocumentTaskPayload:
        documents_raw = data.get("documents")
        if not isinstance(documents_raw, list) or not documents_raw:
            raise ValueError("Bulk document payload requires a non-empty documents array")

        documents = [DocumentTaskPayload.from_dict(item) for item in documents_raw]
        user_id = str(data.get("userId") or documents[0].user_id)

        return cls(
            user_id=user_id,
            documents=documents,
            bulk_operation_id=data.get("bulkOperationId"),
            notify_summary=bool(data.get("notifySummary", True)),
            suppress_per_document_notifications=bool(
                data.get("suppressPerDocumentNotifications", True)
            ),
        )


@dataclass(frozen=True, slots=True)
class TitleTaskPayload:
    document_id: str
    user_id: str
    key: str
    original_name: str | None

    @classmethod
    def from_dict(cls, data: Payload) -> TitleTaskPayload:
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            key=data["key"],
            original_name=data.get("originalName"),
        )


@dataclass(frozen=True, slots=True)
class IndexDocumentPayload:
    document_id: str
    user_id: str
    manual_trigger: bool
    bulk_operation_id: str | None
    suppress_notifications: bool

    @classmethod
    def from_dict(cls, data: Payload) -> IndexDocumentPayload:
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
            manual_trigger=bool(data.get("manualTrigger", False)),
            bulk_operation_id=data.get("bulkOperationId"),
            suppress_notifications=bool(data.get("suppressNotifications", False)),
        )


@dataclass(frozen=True, slots=True)
class DeleteDocumentIndexPayload:
    document_id: str
    user_id: str

    @classmethod
    def from_dict(cls, data: Payload) -> DeleteDocumentIndexPayload:
        return cls(
            document_id=data["documentId"],
            user_id=data["userId"],
        )


@dataclass(frozen=True, slots=True)
class BackfillDocumentsPayload:
    requested_by: str
    batch_size: int

    @classmethod
    def from_dict(cls, data: Payload) -> BackfillDocumentsPayload:
        return cls(
            requested_by=str(data.get("requestedBy") or "system"),
            batch_size=max(1, int(data.get("batchSize") or 100)),
        )
