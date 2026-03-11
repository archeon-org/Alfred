from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest

from application.workers import async_utils as async_utils_module
from application.workers.notification_payloads import (
    build_bulk_processing_summary_notification,
    build_document_index_failed_notification,
    build_document_indexed_notification,
    build_document_processing_failed_notification,
    build_title_failed_notification,
    build_title_generated_notification,
)
from application.workers.payloads import (
    BackfillDocumentsPayload,
    BulkDocumentTaskPayload,
    DeleteDocumentIndexPayload,
    DocumentTaskPayload,
    IndexDocumentPayload,
    TitleTaskPayload,
)


def test_payload_parsing_for_document_and_title_tasks() -> None:
    document_payload = DocumentTaskPayload.from_dict(
        {
            "documentId": "doc-1",
            "userId": "user-1",
            "key": "path/doc.pdf",
            "originalName": "doc.pdf",
            "bulkOperationId": "bulk-1",
            "suppressNotifications": True,
        }
    )
    title_payload = TitleTaskPayload.from_dict(
        {
            "documentId": "doc-2",
            "userId": "user-2",
            "key": "path/title.pdf",
        }
    )

    assert document_payload.document_id == "doc-1"
    assert document_payload.suppress_notifications is True
    assert title_payload.document_id == "doc-2"


def test_bulk_payload_requires_documents() -> None:
    with pytest.raises(ValueError, match="non-empty documents"):
        BulkDocumentTaskPayload.from_dict({"documents": []})


def test_bulk_payload_defaults() -> None:
    payload = BulkDocumentTaskPayload.from_dict(
        {
            "documents": [
                {
                    "documentId": "doc-1",
                    "userId": "user-1",
                    "key": "doc-1.pdf",
                }
            ]
        }
    )

    assert payload.user_id == "user-1"
    assert payload.notify_summary is True
    assert payload.suppress_per_document_notifications is True


def test_index_delete_and_backfill_payloads() -> None:
    index_payload = IndexDocumentPayload.from_dict(
        {
            "documentId": "doc-1",
            "userId": "user-1",
            "manualTrigger": True,
            "suppressNotifications": True,
        }
    )
    delete_payload = DeleteDocumentIndexPayload.from_dict(
        {"documentId": "doc-1", "userId": "user-1"}
    )
    backfill_payload = BackfillDocumentsPayload.from_dict({"requestedBy": "admin", "batchSize": 0})

    assert index_payload.manual_trigger is True
    assert index_payload.suppress_notifications is True
    assert delete_payload.document_id == "doc-1"
    assert backfill_payload.requested_by == "admin"
    assert backfill_payload.batch_size == 100


def test_notification_payload_builders() -> None:
    title_generated = build_title_generated_notification("user-1", "doc-1", "New Title")
    title_failed = build_title_failed_notification("user-1", "doc-1")
    processing_failed = build_document_processing_failed_notification("user-1", "doc-1")
    indexed = build_document_indexed_notification("user-1", "doc-1", 12)
    failed_refund = build_document_index_failed_notification("user-1", "doc-1", refunded=True)
    failed_no_refund = build_document_index_failed_notification("user-1", "doc-1", refunded=False)
    summary = build_bulk_processing_summary_notification("user-1", 4, 3, 1, "bulk-1")

    assert title_generated.title == "Title Generated"
    assert title_failed.notification_type.value == "document_error"
    assert processing_failed.data["documentId"] == "doc-1"
    assert indexed.data["chunkCount"] == 12
    assert "refunded" in failed_refund.message
    assert "refunded" not in failed_no_refund.message
    assert summary.data["bulkOperationId"] == "bulk-1"


def test_run_coroutine_sync_executes_on_worker_loop() -> None:
    if (
        async_utils_module._worker_loop is not None
        and not async_utils_module._worker_loop.is_closed()
    ):
        async_utils_module._worker_loop.close()
    async_utils_module._worker_loop = None

    async def _value():
        return 42

    assert async_utils_module.run_coroutine_sync(_value()) == 42


@pytest.mark.asyncio
async def test_run_coroutine_sync_rejects_active_event_loop() -> None:
    async def _value():
        return 1

    coro = _value()
    with pytest.raises(RuntimeError, match="active event loop"):
        async_utils_module.run_coroutine_sync(coro)
    coro.close()


def _reload_tasks_with_plain_decorator(monkeypatch: pytest.MonkeyPatch):
    import core.celery_app as celery_app_module
    import tasks.document as document_tasks
    import tasks.rag as rag_tasks

    monkeypatch.setattr(
        celery_app_module.celery_app,
        "task",
        lambda *args, **kwargs: lambda fn: fn,
    )

    return importlib.reload(document_tasks), importlib.reload(rag_tasks)


def test_document_tasks_delegate_to_service(monkeypatch: pytest.MonkeyPatch) -> None:
    document_tasks, _ = _reload_tasks_with_plain_decorator(monkeypatch)
    calls: dict[str, object] = {}

    fake_service = SimpleNamespace(
        process_document=lambda **kwargs: calls.setdefault("process_document", kwargs),
        process_documents_bulk=lambda **kwargs: {"status": "ok", **kwargs},
        generate_title=lambda data: calls.setdefault("generate_title", data),
    )
    monkeypatch.setattr(document_tasks, "get_document_task_service", lambda: fake_service)

    task_self = SimpleNamespace(request=SimpleNamespace(retries=1))
    document_tasks.process_document(task_self, {"documentId": "doc-1"})
    bulk_result = document_tasks.process_documents_bulk(task_self, {"documents": []})
    document_tasks.generate_title(task_self, {"documentId": "doc-2"})

    assert calls["process_document"]["retries"] == 1
    assert calls["process_document"]["max_retries"] == document_tasks.PROCESS_DOCUMENT_MAX_RETRIES
    assert bulk_result["status"] == "ok"
    assert calls["generate_title"]["documentId"] == "doc-2"


def test_rag_tasks_delegate_to_service(monkeypatch: pytest.MonkeyPatch) -> None:
    _, rag_tasks = _reload_tasks_with_plain_decorator(monkeypatch)

    fake_service = SimpleNamespace(
        index_document=lambda **kwargs: {"status": "completed", **kwargs},
        delete_document_index=lambda **kwargs: {"status": "deleted", **kwargs},
        backfill_documents=lambda **kwargs: {"status": "queued", **kwargs},
    )
    monkeypatch.setattr(rag_tasks, "get_rag_task_service", lambda: fake_service)

    task_self = SimpleNamespace(request=SimpleNamespace(retries=2))
    index_result = rag_tasks.index_document(task_self, {"documentId": "doc-1"})
    delete_result = rag_tasks.delete_document_index(task_self, {"documentId": "doc-1"})
    backfill_result = rag_tasks.backfill_documents(task_self, {"batchSize": 100})

    assert index_result["status"] == "completed"
    assert index_result["max_retries"] == rag_tasks.INDEX_DOCUMENT_MAX_RETRIES
    assert delete_result["retries"] == 2
    assert backfill_result["status"] == "queued"
