from __future__ import annotations

from domain.models import (
    DocumentContext,
    GraphIngestionJob,
    OCRResult,
    ProcessDocumentJob,
)


def test_document_context_string_representation() -> None:
    context = DocumentContext(
        document_id="1234567890abcdef",
        user_id="user-1",
        storage_key="k",
    )
    assert str(context) == "Document(12345678...)"


def test_ocr_result_properties() -> None:
    non_empty = OCRResult(text="a" * 55)
    almost_empty = OCRResult(text="  short  ")
    assert non_empty.char_count == 55
    assert non_empty.is_empty is False
    assert almost_empty.is_empty is True


def test_process_document_job_from_dict() -> None:
    job = ProcessDocumentJob.from_dict(
        {
            "documentId": "doc-1",
            "userId": "user-1",
            "key": "path/doc.pdf",
            "originalName": "doc.pdf",
        }
    )
    assert job.document_id == "doc-1"
    assert job.user_id == "user-1"
    assert job.key == "path/doc.pdf"
    assert job.original_name == "doc.pdf"


def test_graph_ingestion_job_from_dict() -> None:
    job = GraphIngestionJob.from_dict(
        {
            "documentId": "doc-2",
            "userId": "user-2",
            "documentName": "Contract",
            "content": "contract content",
            "referenceTime": "2026-01-01T00:00:00Z",
        }
    )
    assert job.document_id == "doc-2"
    assert job.document_name == "Contract"
    assert job.reference_time == "2026-01-01T00:00:00Z"
