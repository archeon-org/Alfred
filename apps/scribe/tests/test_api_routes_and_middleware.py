from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Response
from starlette.requests import Request

from api import middleware as middleware_module
from api import rag as api_rag_module
from api.schemas.rag import (
    RagBackfillRequest,
    RagChatRequest,
    RagDocumentSearchRequest,
    RagQuestionRequest,
)
from rag.types import RagCitation


def _make_request(path: str, headers: dict[str, str] | None = None) -> Request:
    raw_headers = [
        (key.lower().encode("utf-8"), value.encode("utf-8"))
        for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": raw_headers,
        "client": ("127.0.0.1", 50000),
        "server": ("test", 80),
    }

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_security_headers_middleware_sets_expected_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    middleware = middleware_module.SecurityHeadersMiddleware(FastAPI())
    monkeypatch.setattr(
        middleware_module,
        "get_settings",
        lambda: SimpleNamespace(is_production=True),
    )

    async def call_next(_: Request) -> Response:
        return Response("ok")

    response = await middleware.dispatch(_make_request("/api/rag/chat"), call_next)

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Strict-Transport-Security"].startswith("max-age")
    assert response.headers["Cache-Control"] == "no-store, no-cache, must-revalidate"


@pytest.mark.asyncio
async def test_security_headers_middleware_skips_cache_headers_for_health(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    middleware = middleware_module.SecurityHeadersMiddleware(FastAPI())
    monkeypatch.setattr(
        middleware_module,
        "get_settings",
        lambda: SimpleNamespace(is_production=False),
    )

    async def call_next(_: Request) -> Response:
        return Response("ok")

    response = await middleware.dispatch(_make_request("/api/health/live"), call_next)

    assert "Cache-Control" not in response.headers
    assert "Strict-Transport-Security" not in response.headers


@pytest.mark.asyncio
async def test_request_timing_middleware_sets_request_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    middleware = middleware_module.RequestTimingMiddleware(FastAPI())
    warning_calls: list[dict[str, object]] = []

    monkeypatch.setattr(
        middleware_module.time,
        "perf_counter",
        lambda: 1.0 if not warning_calls else 7.2,
    )
    monkeypatch.setattr(
        middleware_module.logger,
        "warning",
        lambda *args, **kwargs: warning_calls.append(kwargs),
    )
    request = _make_request("/api/rag/chat", {"X-Request-ID": "rid-1"})

    async def call_next(_: Request) -> Response:
        warning_calls.append({})
        return Response("ok")

    response = await middleware.dispatch(request, call_next)

    assert response.headers["X-Request-ID"] == "rid-1"
    assert response.headers["X-Response-Time"].endswith("s")
    assert len(warning_calls) == 2


@pytest.mark.asyncio
async def test_request_size_limit_middleware_rejects_large_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    middleware = middleware_module.RequestSizeLimitMiddleware(FastAPI())
    monkeypatch.setattr(
        middleware_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=10),
    )

    async def call_next(_: Request) -> Response:
        return Response("ok")

    request = _make_request("/api/rag/chat", {"content-length": "11"})
    response = await middleware.dispatch(request, call_next)

    assert response.status_code == 413
    assert b"Request body too large" in response.body


@pytest.mark.asyncio
async def test_request_size_limit_middleware_passes_small_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    middleware = middleware_module.RequestSizeLimitMiddleware(FastAPI())
    monkeypatch.setattr(
        middleware_module,
        "get_settings",
        lambda: SimpleNamespace(max_request_size=100),
    )

    async def call_next(_: Request) -> Response:
        return Response("ok", status_code=201)

    request = _make_request("/api/rag/chat", {"content-length": "42"})
    response = await middleware.dispatch(request, call_next)

    assert response.status_code == 201


def _citation() -> RagCitation:
    return RagCitation(
        chunk_id="chunk-1",
        document_id="doc-1",
        snippet="snippet",
        score=0.9,
        start_offset=0,
        end_offset=10,
    )


@pytest.mark.asyncio
async def test_rag_search_documents_route_serializes_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_service = SimpleNamespace(
        execute_document_search=lambda **_: _resolved(
            SimpleNamespace(
                query="q",
                rewritten_query="q",
                user_id="user-1",
                documents=[
                    SimpleNamespace(
                        document_id="doc-1",
                        score=0.9,
                        best_snippet="best",
                        citations=[_citation()],
                    )
                ],
                processing_time_ms=5.2,
            )
        )
    )
    monkeypatch.setattr(api_rag_module, "get_rag_service", lambda: fake_service)

    response = await api_rag_module.search_documents(
        RagDocumentSearchRequest(query="qq", user_id="user-1", limit=5, mode="hybrid"),
        None,
    )

    assert response.count == 1
    assert response.documents[0].document_id == "doc-1"
    assert response.documents[0].citations[0].chunk_id == "chunk-1"


@pytest.mark.asyncio
async def test_rag_chat_and_question_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    fake_answer = SimpleNamespace(
        answer="answer",
        citations=[_citation()],
        processing_time_ms=10.0,
        confidence="high",
    )
    fake_service = SimpleNamespace(
        execute_answer=lambda **kwargs: _capture_and_resolve(calls, kwargs, fake_answer)
    )
    monkeypatch.setattr(api_rag_module, "get_rag_service", lambda: fake_service)

    chat_response = await api_rag_module.chat(
        RagChatRequest(
            message="hello",
            user_id="user-1",
            max_context_results=10,
            user_context={"full_name": "Test User", "current_date": "2026-03-06"},
        ),
        None,
    )
    question_response = await api_rag_module.question(
        RagQuestionRequest(
            question="hello?",
            user_id="user-1",
            max_context_results=10,
            user_context={"full_name": "Test User", "current_date": "2026-03-06"},
        ),
        None,
    )

    assert chat_response.answer == "answer"
    assert question_response.confidence == "high"
    assert calls[0]["user_context"] == {
        "full_name": "Test User",
        "current_date": "2026-03-06",
    }
    assert calls[1]["user_context"] == {
        "full_name": "Test User",
        "current_date": "2026-03-06",
    }


@pytest.mark.asyncio
async def test_rag_chat_stream_route_serializes_events_and_results(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _stream_answer(**_: object):
        yield {
            "type": "event",
            "stage": "retrieve_chunks",
            "message": "Searching chunks",
            "metadata": {"round": 1},
        }
        yield {
            "type": "result",
            "answer": "streamed answer",
            "citations": [_citation()],
            "confidence": "high",
            "processing_time_ms": 12.0,
        }

    fake_service = SimpleNamespace(stream_answer=_stream_answer)
    monkeypatch.setattr(api_rag_module, "get_rag_service", lambda: fake_service)

    response = await api_rag_module.chat_stream(
        RagChatRequest(message="hello", user_id="user-1", max_context_results=10),
        None,
    )

    chunks: list[str] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk))
    payloads = [json.loads(line) for line in "".join(chunks).splitlines() if line.strip()]

    assert payloads[0]["type"] == "event"
    assert payloads[1]["type"] == "result"
    assert payloads[1]["citations"][0]["chunk_id"] == "chunk-1"


@pytest.mark.asyncio
async def test_rag_question_stream_route_forwards_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: dict[str, object] = {}

    async def _stream_answer(**kwargs: object):
        calls.update(kwargs)
        yield {
            "type": "result",
            "answer": "ok",
            "citations": [_citation()],
            "confidence": "medium",
            "processing_time_ms": 8.0,
        }

    fake_service = SimpleNamespace(stream_answer=_stream_answer)
    monkeypatch.setattr(api_rag_module, "get_rag_service", lambda: fake_service)

    response = await api_rag_module.question_stream(
        RagQuestionRequest(
            question="hello?",
            user_id="user-1",
            max_context_results=10,
            agent_mode="reasoning",
            user_context={"timezone": "Europe/Paris"},
        ),
        None,
    )
    chunks: list[str] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk))

    payloads = [json.loads(line) for line in "".join(chunks).splitlines() if line.strip()]
    assert calls["query"] == "hello?"
    assert calls["agent_mode"] == "reasoning"
    assert calls["user_context"] == {"timezone": "Europe/Paris"}
    assert payloads[0]["type"] == "result"


@pytest.mark.asyncio
async def test_rag_backfill_route_enqueues_task(monkeypatch: pytest.MonkeyPatch) -> None:
    import tasks.rag as task_rag_module

    fake_task = SimpleNamespace(delay=lambda _: SimpleNamespace(id="task-123"))
    monkeypatch.setattr(task_rag_module, "backfill_documents", fake_task)

    response = await api_rag_module.backfill(
        RagBackfillRequest(requested_by="admin", batch_size=123),
        None,
    )

    assert response.status == "queued"
    assert response.details == "task_id=task-123"


def test_serialize_citation_maps_fields() -> None:
    serialized = api_rag_module._serialize_citation(_citation())
    assert serialized.chunk_id == "chunk-1"
    assert serialized.document_id == "doc-1"


async def _resolved(value):
    return value


async def _capture_and_resolve(
    calls: list[dict[str, object]],
    payload: dict[str, object],
    value: object,
):
    calls.append(payload)
    return value
