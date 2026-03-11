from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError

from domain.models import ClassificationResult, NewCategory, ProcessingStatus
from pipelines import document as document_pipeline_module
from pipelines import title as title_pipeline_module
from services import credit as credit_module
from services import r2 as r2_module
from services.classification import llm_client as llm_client_module
from services.classification import prompt_builder as prompt_builder_module
from services.classification import result_parser as result_parser_module
from services.classification import service as classification_service_module


def test_document_pipeline_process_with_existing_category(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}

    class FakeRepository:
        def __init__(self, session) -> None:
            self.session = session

        def is_already_processed(self, document_id: str) -> bool:
            return False

        def update_status(self, document_id: str, status: ProcessingStatus) -> None:
            calls["status"] = (document_id, status)

        def get_mimetype(self, document_id: str) -> str:
            return "application/pdf"

        def get_user_taxonomy(self, user_id: str):
            return SimpleNamespace(
                categories=[{"id": "cat-1", "name": "Invoices"}],
                tags=[{"id": "tag-1", "name": "Tax"}],
            )

        def complete_processing(
            self,
            document_id: str,
            content: str,
            title: str,
            category_id: str | None,
        ) -> None:
            calls["complete"] = (document_id, content, title, category_id)

        def update_tags(self, document_id: str, tag_ids: list[str]) -> None:
            calls["tags"] = (document_id, tag_ids)

        def create_category(
            self,
            user_id: str,
            name: str,
            icon: str,
            color: str,
            parent_id: str | None = None,
            order: int = 0,
        ) -> str:
            calls["created_category"] = (user_id, name, icon, color, parent_id, order)
            return "cat-new"

        def mark_failed(self, document_id: str) -> None:
            calls["failed"] = document_id

    queue_payloads: list[dict[str, object]] = []
    monkeypatch.setattr(
        document_pipeline_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=1024),
    )
    monkeypatch.setattr(document_pipeline_module, "DocumentRepository", FakeRepository)
    monkeypatch.setattr(
        document_pipeline_module,
        "get_r2_service",
        lambda: SimpleNamespace(get_file=lambda key: b"pdf-bytes"),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "get_ocr_service",
        lambda: SimpleNamespace(recognize=lambda *args, **kwargs: "OCR content"),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "get_classification_service",
        lambda: SimpleNamespace(
            classify_document=lambda *args, **kwargs: ClassificationResult(
                title="Invoice April",
                category_id="cat-1",
                tag_ids=["tag-1"],
            )
        ),
    )

    import tasks.rag as task_rag_module

    monkeypatch.setattr(
        task_rag_module,
        "index_document",
        SimpleNamespace(delay=lambda payload: queue_payloads.append(payload)),
    )

    pipeline = document_pipeline_module.DocumentPipeline(session=object())
    result = pipeline.process(
        document_pipeline_module.DocumentJob(
            document_id="doc-1",
            user_id="user-1",
            r2_key="path/doc.pdf",
            original_name="doc.pdf",
            bulk_operation_id="bulk-1",
            suppress_notifications=True,
        )
    )

    assert calls["status"] == ("doc-1", ProcessingStatus.PROCESSING)
    assert calls["complete"] == ("doc-1", "OCR content", "Invoice April", "cat-1")
    assert calls["tags"] == ("doc-1", ["tag-1"])
    assert result.status == ProcessingStatus.COMPLETED
    assert queue_payloads[0]["bulkOperationId"] == "bulk-1"
    assert queue_payloads[0]["suppressNotifications"] is True


def test_document_pipeline_process_creates_category_when_needed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRepository:
        def __init__(self, session) -> None:
            self.created = None
            self.updated = None

        def is_already_processed(self, document_id: str) -> bool:
            return False

        def update_status(self, document_id: str, status: ProcessingStatus) -> None:
            return None

        def get_mimetype(self, document_id: str) -> str:
            return "application/pdf"

        def get_user_taxonomy(self, user_id: str):
            return SimpleNamespace(categories=[], tags=[])

        def complete_processing(self, document_id, content, title, category_id) -> None:
            self.updated = category_id

        def update_tags(self, document_id: str, tag_ids: list[str]) -> None:
            raise AssertionError("update_tags should not be called when tag list is empty")

        def create_category(
            self,
            user_id: str,
            name: str,
            icon: str,
            color: str,
            parent_id: str | None = None,
            order: int = 0,
        ) -> str:
            self.created = (user_id, name, icon, color, parent_id, order)
            return "cat-generated"

        def mark_failed(self, document_id: str) -> None:
            return None

    repo = FakeRepository(None)
    monkeypatch.setattr(
        document_pipeline_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=1024),
    )
    monkeypatch.setattr(document_pipeline_module, "DocumentRepository", lambda _: repo)
    monkeypatch.setattr(
        document_pipeline_module,
        "get_r2_service",
        lambda: SimpleNamespace(get_file=lambda key: b"file"),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "get_ocr_service",
        lambda: SimpleNamespace(recognize=lambda *args, **kwargs: "content"),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "get_classification_service",
        lambda: SimpleNamespace(
            classify_document=lambda *args, **kwargs: ClassificationResult(
                title="Generated title",
                new_category=NewCategory(name="Trips", icon="airplane", color="#abc123"),
            )
        ),
    )

    import tasks.rag as task_rag_module

    monkeypatch.setattr(
        task_rag_module, "index_document", SimpleNamespace(delay=lambda payload: None)
    )

    pipeline = document_pipeline_module.DocumentPipeline(session=object())
    result = pipeline.process(
        document_pipeline_module.DocumentJob(
            document_id="doc-2",
            user_id="user-1",
            r2_key="path/doc-2.pdf",
            original_name="doc-2.pdf",
        )
    )

    assert repo.created == ("user-1", "Trips", "airplane", "#abc123", None, 0)
    assert repo.updated == "cat-generated"
    assert result.category_id == "cat-generated"


def test_document_pipeline_download_rejects_large_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        document_pipeline_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=5),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "DocumentRepository",
        lambda _: SimpleNamespace(is_already_processed=lambda _: False),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "get_r2_service",
        lambda: SimpleNamespace(get_file=lambda _: b"0123456789"),
    )

    pipeline = document_pipeline_module.DocumentPipeline(session=object())

    with pytest.raises(ValueError, match="exceeds max size"):
        pipeline._download_file("path/large.pdf")


def test_document_pipeline_queue_indexing_swallow_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        document_pipeline_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=1024),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "DocumentRepository",
        lambda _: SimpleNamespace(is_already_processed=lambda _: False),
    )

    import tasks.rag as task_rag_module

    monkeypatch.setattr(
        task_rag_module,
        "index_document",
        SimpleNamespace(delay=lambda payload: (_ for _ in ()).throw(RuntimeError("queue down"))),
    )

    pipeline = document_pipeline_module.DocumentPipeline(session=object())
    pipeline._queue_document_indexing("doc-1", "user-1")


def test_document_pipeline_mark_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}
    monkeypatch.setattr(
        document_pipeline_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=1024),
    )
    monkeypatch.setattr(
        document_pipeline_module,
        "DocumentRepository",
        lambda _: SimpleNamespace(
            is_already_processed=lambda _: False,
            mark_failed=lambda document_id: calls.update({"document_id": document_id}),
        ),
    )

    pipeline = document_pipeline_module.DocumentPipeline(session=object())
    pipeline.mark_failed("doc-9")

    assert calls["document_id"] == "doc-9"


def test_title_pipeline_uses_existing_content(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, object] = {}

    class FakeRepository:
        def __init__(self, session) -> None:
            return None

        def get_content(self, document_id: str) -> str:
            return "existing content"

        def update_content(self, document_id: str, content: str) -> None:
            calls["content"] = content

        def update_title(self, document_id: str, title: str) -> None:
            calls["title"] = (document_id, title)

    monkeypatch.setattr(title_pipeline_module, "DocumentRepository", FakeRepository)
    monkeypatch.setattr(
        title_pipeline_module,
        "get_classification_service",
        lambda: SimpleNamespace(
            generate_title=lambda content, original_name: SimpleNamespace(title="New title")
        ),
    )

    pipeline = title_pipeline_module.TitlePipeline(session=object())
    result = pipeline.process(
        title_pipeline_module.TitleJob(
            document_id="doc-1",
            user_id="user-1",
            r2_key="path/doc.pdf",
            original_name="doc.pdf",
        )
    )

    assert calls["title"] == ("doc-1", "New title")
    assert "content" not in calls
    assert result.title == "New title"


def test_title_pipeline_fetches_content_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}

    class FakeRepository:
        def __init__(self, session) -> None:
            return None

        def get_content(self, document_id: str) -> str | None:
            return None

        def update_content(self, document_id: str, content: str) -> None:
            calls["content"] = (document_id, content)

        def update_title(self, document_id: str, title: str) -> None:
            calls["title"] = title

    monkeypatch.setattr(title_pipeline_module, "DocumentRepository", FakeRepository)
    monkeypatch.setattr(
        title_pipeline_module,
        "get_r2_service",
        lambda: SimpleNamespace(get_file=lambda key: b"pdf-bytes"),
    )
    monkeypatch.setattr(
        title_pipeline_module,
        "get_ocr_service",
        lambda: SimpleNamespace(recognize=lambda data: "ocr content"),
    )
    monkeypatch.setattr(
        title_pipeline_module,
        "get_classification_service",
        lambda: SimpleNamespace(
            generate_title=lambda content, original_name: SimpleNamespace(title="OCR title")
        ),
    )

    pipeline = title_pipeline_module.TitlePipeline(session=object())
    result = pipeline.process(
        title_pipeline_module.TitleJob(
            document_id="doc-2",
            user_id="user-1",
            r2_key="path/doc-2.pdf",
            original_name="doc-2.pdf",
        )
    )

    assert calls["content"] == ("doc-2", "ocr content")
    assert calls["title"] == "OCR title"
    assert result.title == "OCR title"


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeSession:
    def __init__(self, row):
        self._row = row
        self.committed = False
        self.params = None

    def execute(self, _stmt, params):
        self.params = params
        return _FakeResult(self._row)

    def commit(self):
        self.committed = True


def test_credit_service_refund_and_add() -> None:
    service = credit_module.CreditService()

    refund_session = _FakeSession((17,))
    refund_balance = service.refund_credits(
        refund_session,
        "user-1",
        credit_module.CreditOperation.AI_CLASSIFICATION,
        "retry",
    )
    assert refund_balance == 17
    assert refund_session.committed is True
    assert refund_session.params["amount"] == 2

    add_session = _FakeSession((25,))
    add_balance = service.add_credits(add_session, "user-1", 5, "manual")
    assert add_balance == 25
    assert add_session.committed is True


def test_credit_service_returns_zero_when_user_missing() -> None:
    service = credit_module.CreditService()
    session = _FakeSession(None)
    balance = service.refund_credits(
        session,
        "missing-user",
        credit_module.CreditOperation.AI_EMBEDDING,
        "missing",
    )
    assert balance == 0
    assert session.committed is False


def test_get_credit_service_is_cached() -> None:
    credit_module._credit_service = None
    first = credit_module.get_credit_service()
    second = credit_module.get_credit_service()
    assert first is second


def _r2_settings() -> SimpleNamespace:
    return SimpleNamespace(
        endpoint_url="https://account.r2.cloudflarestorage.com",
        access_key_id=SimpleNamespace(get_secret_value=lambda: "access"),
        secret_access_key=SimpleNamespace(get_secret_value=lambda: "secret"),
        bucket_name="bucket",
    )


def test_r2_service_methods(monkeypatch: pytest.MonkeyPatch) -> None:
    uploads: list[tuple[object, str, str, dict]] = []
    deletes: list[str] = []
    heads: list[str] = []

    class FakeBody:
        def read(self):
            return b"body-data"

    class FakeClient:
        def get_object(self, Bucket: str, Key: str):
            return {"Body": FakeBody()}

        def upload_fileobj(self, fileobj, bucket: str, key: str, ExtraArgs: dict):
            uploads.append((fileobj, bucket, key, ExtraArgs))

        def delete_object(self, Bucket: str, Key: str):
            deletes.append(Key)

        def generate_presigned_url(self, op: str, Params: dict, ExpiresIn: int):
            return f"https://download/{Params['Key']}?exp={ExpiresIn}"

        def head_object(self, Bucket: str, Key: str):
            heads.append(Key)

    monkeypatch.setattr(
        r2_module,
        "get_settings",
        lambda: SimpleNamespace(r2=_r2_settings()),
    )
    monkeypatch.setattr(r2_module.boto3, "client", lambda *args, **kwargs: FakeClient())

    service = r2_module.R2Service()
    assert service.get_file("doc.pdf") == b"body-data"

    service.upload_file("upload.pdf", b"bytes", "application/pdf")
    assert isinstance(uploads[0][0], BytesIO)
    assert uploads[0][2] == "upload.pdf"

    service.delete_file("upload.pdf")
    assert deletes == ["upload.pdf"]

    url = service.generate_presigned_url("doc.pdf", expires_in=120)
    assert "doc.pdf" in url
    assert service.file_exists("doc.pdf") is True
    assert heads == ["doc.pdf"]


def test_r2_service_handles_client_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class ErrorClient:
        def get_object(self, Bucket: str, Key: str):
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")

        def upload_fileobj(self, fileobj, bucket: str, key: str, ExtraArgs: dict):
            raise ClientError({"Error": {"Code": "UploadFailed"}}, "PutObject")

        def delete_object(self, Bucket: str, Key: str):
            raise ClientError({"Error": {"Code": "DeleteFailed"}}, "DeleteObject")

        def generate_presigned_url(self, op: str, Params: dict, ExpiresIn: int):
            raise ClientError({"Error": {"Code": "SignFailed"}}, "GetObject")

        def head_object(self, Bucket: str, Key: str):
            raise ClientError({"Error": {"Code": "NotFound"}}, "HeadObject")

    monkeypatch.setattr(
        r2_module,
        "get_settings",
        lambda: SimpleNamespace(r2=_r2_settings()),
    )
    monkeypatch.setattr(r2_module.boto3, "client", lambda *args, **kwargs: ErrorClient())

    service = r2_module.R2Service()
    with pytest.raises(ClientError):
        service.get_file("missing.pdf")
    with pytest.raises(ClientError):
        service.upload_file("doc.pdf", b"x")
    with pytest.raises(ClientError):
        service.delete_file("doc.pdf")
    with pytest.raises(ClientError):
        service.generate_presigned_url("doc.pdf")
    assert service.file_exists("doc.pdf") is False


def test_get_r2_service_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        r2_module,
        "get_settings",
        lambda: SimpleNamespace(r2=_r2_settings()),
    )
    monkeypatch.setattr(
        r2_module.boto3,
        "client",
        lambda *args, **kwargs: SimpleNamespace(
            get_object=lambda **_: {"Body": SimpleNamespace(read=lambda: b"")},
            upload_fileobj=lambda *args, **kwargs: None,
            delete_object=lambda **_: None,
            generate_presigned_url=lambda *args, **kwargs: "",
            head_object=lambda **_: None,
        ),
    )

    r2_module._r2_service = None
    first = r2_module.get_r2_service()
    second = r2_module.get_r2_service()
    assert first is second


def test_prompt_builder_and_result_parser() -> None:
    prompt_builder = prompt_builder_module.PromptBuilder()
    parser = result_parser_module.ResultParser()

    prompt = prompt_builder.build_classification_prompt(
        content="my document content",
        categories=[],
        tags=[],
        original_filename="invoice.pdf",
    )
    assert 'Original filename: "invoice.pdf"' in prompt
    assert "(No categories defined yet)" in prompt
    assert "(No tags defined yet)" in prompt

    truncated = prompt_builder.truncate_content("abcdefghij", max_chars=6)
    assert "...[truncated]..." in truncated

    parsed = parser.parse_classification(
        {
            "categoryId": None,
            "newCategory": {"name": "Receipts", "icon": "folder", "color": "invalid"},
            "tagIds": ["tag-1"],
            "title": "A very long title that should be truncated if needed",
        }
    )
    assert parsed.new_category is not None
    assert parsed.new_category.color.startswith("#")
    assert parsed.tag_ids == ["tag-1"]
    assert parser.parse_title({"title": ""}) == "Untitled Document"


def test_llm_client_complete_json(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeCompletions:
        def __init__(self, content: str):
            self.content = content

        def create(self, **kwargs):
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=self.content))]
            )

    class FakeOpenAI:
        def __init__(self, api_key: str, base_url: str):
            self.chat = SimpleNamespace(completions=FakeCompletions('{"ok": true}'))

    monkeypatch.setattr(llm_client_module, "OpenAI", FakeOpenAI)
    client = llm_client_module.LLMClient(
        llm_client_module.LLMConfig(
            api_key="key",
            base_url="http://llm",
            model="model-x",
        )
    )
    assert client.complete_json("system", "user") == {"ok": True}


def test_llm_client_raises_on_empty_response(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeCompletions:
        def create(self, **kwargs):
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=""))])

    class FakeOpenAI:
        def __init__(self, api_key: str, base_url: str):
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setattr(llm_client_module, "OpenAI", FakeOpenAI)
    client = llm_client_module.LLMClient(
        llm_client_module.LLMConfig(
            api_key="key",
            base_url="http://llm",
            model="model-x",
        )
    )

    with pytest.raises(ValueError, match="Empty response"):
        client.complete_json("system", "user")


def test_classification_service_classify_and_title(monkeypatch: pytest.MonkeyPatch) -> None:
    ai_settings = SimpleNamespace(
        fireworks_api_key=SimpleNamespace(get_secret_value=lambda: "key"),
        fireworks_base_url="http://llm",
        classification_model="model-x",
    )
    monkeypatch.setattr(
        classification_service_module,
        "get_settings",
        lambda: SimpleNamespace(ai=ai_settings),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LLMClient",
        lambda cfg: SimpleNamespace(
            complete_json=lambda **kwargs: (
                {
                    "title": "Classified title",
                    "categoryId": "cat-1",
                    "tagIds": ["tag-1"],
                }
                if kwargs.get("max_tokens") is None
                else {"title": "Generated title"}
            )
        ),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LangGraphClassificationWorkflow",
        lambda cfg: (_ for _ in ()).throw(RuntimeError("workflow unavailable")),
    )

    service = classification_service_module.ClassificationService()

    classified = service.classify_document(
        "some content",
        [{"id": "cat-1", "name": "Invoices"}],
        [{"id": "tag-1", "name": "Tax"}],
        "invoice.pdf",
    )
    generated = service.generate_title("some content", "invoice.pdf")

    assert classified.category_id == "cat-1"
    assert classified.tag_ids == ["tag-1"]
    assert generated.title == "Generated title"


def test_classification_service_error_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    ai_settings = SimpleNamespace(
        fireworks_api_key=SimpleNamespace(get_secret_value=lambda: "key"),
        fireworks_base_url="http://llm",
        classification_model="model-x",
    )
    monkeypatch.setattr(
        classification_service_module,
        "get_settings",
        lambda: SimpleNamespace(ai=ai_settings),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LLMClient",
        lambda cfg: SimpleNamespace(
            complete_json=lambda **kwargs: (_ for _ in ()).throw(RuntimeError("llm down"))
        ),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LangGraphClassificationWorkflow",
        lambda cfg: (_ for _ in ()).throw(RuntimeError("workflow unavailable")),
    )
    service = classification_service_module.ClassificationService()

    with pytest.raises(RuntimeError, match="llm down"):
        service.classify_document("content", [], [])

    with pytest.raises(RuntimeError, match="llm down"):
        service.generate_title("content")


def test_get_classification_service_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    ai_settings = SimpleNamespace(
        fireworks_api_key=SimpleNamespace(get_secret_value=lambda: "key"),
        fireworks_base_url="http://llm",
        classification_model="model-x",
    )
    monkeypatch.setattr(
        classification_service_module,
        "get_settings",
        lambda: SimpleNamespace(ai=ai_settings),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LLMClient",
        lambda cfg: SimpleNamespace(complete_json=lambda **kwargs: {"title": "x"}),
    )
    monkeypatch.setattr(
        classification_service_module,
        "LangGraphClassificationWorkflow",
        lambda cfg: (_ for _ in ()).throw(RuntimeError("workflow unavailable")),
    )

    classification_service_module._classification_service = None
    first = classification_service_module.get_classification_service()
    second = classification_service_module.get_classification_service()
    assert first is second
