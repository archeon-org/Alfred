from __future__ import annotations

from types import SimpleNamespace

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from application.workers import document_task_service as document_task_module
from application.workers import rag_task_service as rag_task_module
from application.workers.payloads import IndexDocumentPayload


class _FakeSession:
    def __init__(self) -> None:
        self.closed = False
        self.rolled_back = False

    def close(self) -> None:
        self.closed = True

    def rollback(self) -> None:
        self.rolled_back = True


def _session_factory_with_store(store: list[_FakeSession]):
    def _factory() -> _FakeSession:
        session = _FakeSession()
        store.append(session)
        return session

    return _factory


def _configure_document_task_service(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[document_task_module.DocumentTaskService, list[_FakeSession]]:
    sessions: list[_FakeSession] = []
    monkeypatch.setattr(
        document_task_module,
        "get_settings",
        lambda: SimpleNamespace(worker_host="worker-1"),
    )
    monkeypatch.setattr(
        document_task_module,
        "get_sync_session_factory",
        lambda: _session_factory_with_store(sessions),
    )
    return document_task_module.DocumentTaskService(), sessions


def _configure_rag_task_service(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[rag_task_module.RagTaskService, list[_FakeSession]]:
    sessions: list[_FakeSession] = []
    monkeypatch.setattr(
        rag_task_module,
        "get_settings",
        lambda: SimpleNamespace(worker_host="worker-1"),
    )
    monkeypatch.setattr(
        rag_task_module,
        "get_sync_session_factory",
        lambda: _session_factory_with_store(sessions),
    )
    monkeypatch.setattr(
        rag_task_module,
        "IngestionOrchestrator",
        lambda: SimpleNamespace(run=lambda **kwargs: None),
    )
    return rag_task_module.RagTaskService(), sessions


def test_document_task_service_process_document_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, sessions = _configure_document_task_service(monkeypatch)
    processed: dict[str, object] = {}

    class FakeDocumentPipeline:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return False

        def process(self, job) -> None:
            processed["job"] = job

    monkeypatch.setattr(document_task_module, "DocumentPipeline", FakeDocumentPipeline)

    service.process_document(
        data={"documentId": "doc-1", "userId": "user-1", "key": "file-1.pdf"},
        retries=0,
        max_retries=1,
    )

    assert processed["job"].document_id == "doc-1"
    assert sessions[0].closed is True


def test_document_task_service_process_document_retry_skip(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, sessions = _configure_document_task_service(monkeypatch)
    processed = {"called": False}

    class FakeDocumentPipeline:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return True

        def process(self, job) -> None:
            processed["called"] = True

    monkeypatch.setattr(document_task_module, "DocumentPipeline", FakeDocumentPipeline)

    service.process_document(
        data={"documentId": "doc-1", "userId": "user-1", "key": "file-1.pdf"},
        retries=1,
        max_retries=1,
    )

    assert processed["called"] is False
    assert sessions[0].closed is True


def test_document_task_service_process_document_handles_soft_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    failure_calls: dict[str, object] = {}

    class FakeDocumentPipeline:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return False

        def process(self, job) -> None:
            raise SoftTimeLimitExceeded()

    monkeypatch.setattr(document_task_module, "DocumentPipeline", FakeDocumentPipeline)
    monkeypatch.setattr(
        service,
        "_handle_processing_failure",
        lambda **kwargs: failure_calls.update(kwargs),
    )

    with pytest.raises(SoftTimeLimitExceeded):
        service.process_document(
            data={"documentId": "doc-1", "userId": "user-1", "key": "file-1.pdf"},
            retries=0,
            max_retries=1,
        )

    assert failure_calls["is_final"] is True


def test_document_task_service_process_document_handles_regular_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    failure_calls: dict[str, object] = {}

    class FakeDocumentPipeline:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return False

        def process(self, job) -> None:
            raise RuntimeError("boom")

    monkeypatch.setattr(document_task_module, "DocumentPipeline", FakeDocumentPipeline)
    monkeypatch.setattr(
        service,
        "_handle_processing_failure",
        lambda **kwargs: failure_calls.update(kwargs),
    )

    with pytest.raises(RuntimeError, match="boom"):
        service.process_document(
            data={"documentId": "doc-1", "userId": "user-1", "key": "file-1.pdf"},
            retries=0,
            max_retries=3,
        )

    assert failure_calls["is_final"] is False


def test_document_task_service_process_documents_bulk_counts_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    summary_calls: dict[str, object] = {}

    class FakeDocumentPipeline:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return document_id == "doc-1"

        def process(self, job) -> None:
            if job.document_id == "doc-2":
                return
            raise RuntimeError("should not happen")

    monkeypatch.setattr(document_task_module, "DocumentPipeline", FakeDocumentPipeline)
    monkeypatch.setattr(
        service,
        "_send_bulk_processing_summary",
        lambda **kwargs: summary_calls.update(kwargs),
    )

    result = service.process_documents_bulk(
        data={
            "userId": "user-1",
            "notifySummary": True,
            "documents": [
                {"documentId": "doc-1", "userId": "user-1", "key": "k1"},
                {"documentId": "doc-2", "userId": "user-1", "key": "k2"},
            ],
        }
    )

    assert result["status"] == "completed"
    assert result["total"] == 2
    assert result["succeeded"] == 1
    assert result["skipped"] == 1
    assert result["failed"] == 0
    assert summary_calls["total"] == 2


def test_document_task_service_generate_title_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    notification_calls: list[object] = []

    class FakeTitlePipeline:
        def __init__(self, session) -> None:
            self.session = session

        def process(self, job):
            return SimpleNamespace(title="Generated")

    monkeypatch.setattr(document_task_module, "TitlePipeline", FakeTitlePipeline)
    monkeypatch.setattr(
        document_task_module,
        "get_notification_service",
        lambda: SimpleNamespace(create=lambda *args, **kwargs: notification_calls.append(args)),
    )

    service.generate_title(
        {"documentId": "doc-1", "userId": "user-1", "key": "file-1.pdf", "originalName": "a.pdf"}
    )

    assert len(notification_calls) == 1


def test_document_task_service_generate_title_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    failure_calls: dict[str, object] = {}

    class FakeTitlePipeline:
        def __init__(self, session) -> None:
            self.session = session

        def process(self, job):
            raise RuntimeError("title failed")

    monkeypatch.setattr(document_task_module, "TitlePipeline", FakeTitlePipeline)
    monkeypatch.setattr(
        service,
        "_handle_title_failure",
        lambda **kwargs: failure_calls.update(kwargs),
    )

    with pytest.raises(RuntimeError, match="title failed"):
        service.generate_title(
            {
                "documentId": "doc-1",
                "userId": "user-1",
                "key": "file-1.pdf",
                "originalName": "a.pdf",
            }
        )

    assert failure_calls["document_id"] == "doc-1"


def test_document_task_service_handle_processing_failure_final_notification(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_document_task_service(monkeypatch)
    session = _FakeSession()
    calls = {"mark_failed": 0, "refund": 0, "notify": 0}

    import repositories.document as document_repo_module

    class FakeDocumentRepository:
        def __init__(self, _session) -> None:
            pass

        def mark_failed(self, document_id: str) -> None:
            calls["mark_failed"] += 1

    monkeypatch.setattr(document_repo_module, "DocumentRepository", FakeDocumentRepository)
    monkeypatch.setattr(
        document_task_module,
        "get_credit_service",
        lambda: SimpleNamespace(
            refund_credits=lambda *args, **kwargs: calls.__setitem__("refund", 1)
        ),
    )
    monkeypatch.setattr(
        document_task_module,
        "get_notification_service",
        lambda: SimpleNamespace(create=lambda *args, **kwargs: calls.__setitem__("notify", 1)),
    )

    service._handle_processing_failure(
        session=session,
        document_id="doc-1",
        user_id="user-1",
        error_message="failed",
        is_final=True,
        suppress_notification=False,
    )

    assert session.rolled_back is True
    assert calls["mark_failed"] == 1
    assert calls["refund"] == 1
    assert calls["notify"] == 1


def test_rag_task_service_index_document_success(monkeypatch: pytest.MonkeyPatch) -> None:
    service, sessions = _configure_rag_task_service(monkeypatch)
    success_calls: dict[str, object] = {}

    monkeypatch.setattr(
        rag_task_module,
        "run_coroutine_sync",
        lambda coro: {"total_chunks": 3, "document_id": "doc-1"},
    )
    monkeypatch.setattr(
        service,
        "_send_index_success_notification",
        lambda **kwargs: success_calls.update(kwargs),
    )

    result = service.index_document(
        data={"documentId": "doc-1", "userId": "user-1", "manualTrigger": False},
        retries=0,
        max_retries=2,
    )

    assert result["status"] == "completed"
    assert success_calls["payload"].document_id == "doc-1"
    assert sessions[0].closed is True


def test_rag_task_service_index_document_failure_calls_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_rag_task_service(monkeypatch)
    failure_calls: dict[str, object] = {}

    monkeypatch.setattr(
        rag_task_module,
        "run_coroutine_sync",
        lambda coro: (_ for _ in ()).throw(RuntimeError("indexing failed")),
    )
    monkeypatch.setattr(
        service,
        "_handle_index_failure",
        lambda **kwargs: failure_calls.update(kwargs),
    )

    with pytest.raises(RuntimeError, match="indexing failed"):
        service.index_document(
            data={"documentId": "doc-1", "userId": "user-1", "manualTrigger": True},
            retries=0,
            max_retries=3,
        )

    assert failure_calls["is_final"] is False
    assert failure_calls["payload"].manual_trigger is True


def test_rag_task_service_delete_document_index(monkeypatch: pytest.MonkeyPatch) -> None:
    service, sessions = _configure_rag_task_service(monkeypatch)

    class FakeChunkRepository:
        def __init__(self, session) -> None:
            self.session = session

        def delete_document_chunks(self, document_id: str, user_id: str) -> int:
            return 4

    monkeypatch.setattr(rag_task_module, "ChunkRepository", FakeChunkRepository)

    result = service.delete_document_index(
        data={"documentId": "doc-1", "userId": "user-1"},
        retries=2,
    )

    assert result["deleted"] == 4
    assert sessions[0].closed is True


def test_rag_task_service_backfill_documents_queues_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_rag_task_service(monkeypatch)
    delay_calls: list[dict[str, object]] = []

    class FakeChunkRepository:
        def __init__(self, session) -> None:
            self.session = session

        def fetch_backfill_candidates(self, batch_size: int):
            return [("doc-1", "user-1"), ("doc-2", "user-2")]

    import tasks.rag as task_rag_module

    monkeypatch.setattr(rag_task_module, "ChunkRepository", FakeChunkRepository)
    monkeypatch.setattr(
        task_rag_module,
        "index_document",
        SimpleNamespace(delay=lambda payload: delay_calls.append(payload)),
    )

    result = service.backfill_documents(data={"requestedBy": "admin", "batchSize": 10})

    assert result["status"] == "queued"
    assert result["queued"] == 2
    assert len(delay_calls) == 2


def test_rag_task_service_handle_index_failure_final_manual_trigger(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _ = _configure_rag_task_service(monkeypatch)
    session = _FakeSession()
    calls = {"refund": 0, "notify": 0}

    monkeypatch.setattr(
        rag_task_module,
        "get_credit_service",
        lambda: SimpleNamespace(
            refund_credits=lambda *args, **kwargs: calls.__setitem__("refund", 1)
        ),
    )
    monkeypatch.setattr(
        rag_task_module,
        "get_notification_service",
        lambda: SimpleNamespace(create=lambda *args, **kwargs: calls.__setitem__("notify", 1)),
    )

    payload = IndexDocumentPayload.from_dict(
        {
            "documentId": "doc-1",
            "userId": "user-1",
            "manualTrigger": True,
            "suppressNotifications": False,
        }
    )
    service._handle_index_failure(
        session=session,
        payload=payload,
        error_message="failed",
        is_final=True,
        suppress_notification=False,
    )

    assert session.rolled_back is True
    assert calls["refund"] == 1
    assert calls["notify"] == 1
