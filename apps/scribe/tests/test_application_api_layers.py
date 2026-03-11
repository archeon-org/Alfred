from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response

from api import auth as api_auth_module
from api import errors as api_errors_module
from api import health as api_health_module
from api.presenters.health import (
    present_health_status,
    present_liveness,
    present_readiness,
    readiness_status_code,
)
from application.api import auth_service as auth_service_module
from application.api import health_service as health_service_module
from application.api import rag_service as rag_service_module
from application.api.auth_service import InternalAuthError
from application.api.errors import ApiServiceError
from application.api.health_service import HealthCheckResult, ReadinessResult
from rag.types import DocumentSearchHit, RagCitation


def _settings_with_key(key: str = "expected-key") -> SimpleNamespace:
    return SimpleNamespace(internal_api_key=key)


def test_internal_auth_service_accepts_matching_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key())
    service = auth_service_module.InternalAuthService()
    service.verify_request("expected-key", None)


def test_internal_auth_service_accepts_matching_bearer_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key())
    service = auth_service_module.InternalAuthService()
    service.verify_request(None, "Bearer expected-key")


def test_internal_auth_service_rejects_invalid_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key())
    service = auth_service_module.InternalAuthService()

    with pytest.raises(InternalAuthError) as exc:
        service.verify_request("wrong", None)

    assert exc.value.status_code == 403


def test_internal_auth_service_requires_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key())
    service = auth_service_module.InternalAuthService()

    with pytest.raises(InternalAuthError) as exc:
        service.verify_request(None, None)

    assert exc.value.status_code == 401
    assert exc.value.headers["WWW-Authenticate"] == "Bearer"


def test_internal_auth_service_skips_verification_when_key_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    warning_mock = SimpleNamespace(called=False)

    def _warning(*args, **kwargs):
        warning_mock.called = True

    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key(""))
    monkeypatch.setattr(auth_service_module.logger, "warning", _warning)

    service = auth_service_module.InternalAuthService()
    service.verify_request(None, None)
    assert warning_mock.called is True


def test_extract_bearer_token_handles_invalid_inputs() -> None:
    assert auth_service_module.InternalAuthService._extract_bearer_token(None) is None
    assert auth_service_module.InternalAuthService._extract_bearer_token("Token abc") is None
    assert auth_service_module.InternalAuthService._extract_bearer_token("Bearer abc") == "abc"


def test_get_internal_auth_service_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_service_module, "get_settings", lambda: _settings_with_key())
    auth_service_module._internal_auth_service = None
    first = auth_service_module.get_internal_auth_service()
    second = auth_service_module.get_internal_auth_service()
    assert first is second


def test_generate_internal_api_key_has_expected_length() -> None:
    key = auth_service_module.generate_internal_api_key()
    assert len(key) == 64


@pytest.mark.asyncio
async def test_verify_internal_service_translates_auth_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = SimpleNamespace(
        verify_request=lambda **_: (_ for _ in ()).throw(
            InternalAuthError(status_code=403, detail="nope")
        )
    )
    monkeypatch.setattr(api_auth_module, "get_internal_auth_service", lambda: service)

    with pytest.raises(HTTPException) as exc:
        await api_auth_module.verify_internal_service("wrong", None)

    assert exc.value.status_code == 403
    assert exc.value.detail == "nope"


@pytest.mark.asyncio
async def test_api_service_error_handler_returns_json_response() -> None:
    response = await api_errors_module.api_service_error_handler(
        request=SimpleNamespace(),
        error=ApiServiceError("failed", status_code=422),
    )
    assert response.status_code == 422
    assert response.body == b'{"detail":"failed"}'


def test_health_presenters_map_values() -> None:
    health = HealthCheckResult(
        status="healthy",
        timestamp="2026-01-01T00:00:00",
        version="1.0.0",
        worker_host="worker-1",
        checks={"database": True, "redis": False},
    )
    readiness = ReadinessResult(ready=False, status="not ready")

    presented_health = present_health_status(health)
    assert presented_health.status == "healthy"
    assert present_liveness().status == "alive"
    assert present_readiness(readiness).status == "not ready"
    assert readiness_status_code(readiness) == 503


def _health_settings() -> SimpleNamespace:
    redis_password = SimpleNamespace(get_secret_value=lambda: "secret")
    redis_settings = SimpleNamespace(
        host="localhost",
        port=6379,
        password=redis_password,
        db=0,
        ssl=False,
    )
    return SimpleNamespace(worker_host="worker-1", redis=redis_settings)


@pytest.mark.asyncio
async def test_health_service_reports_healthy(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeRedisClient:
        def ping(self) -> None:
            return None

        def close(self) -> None:
            return None

    monkeypatch.setattr(health_service_module, "get_settings", _health_settings)
    monkeypatch.setattr(
        health_service_module,
        "check_database_connection",
        lambda: _resolved(True),
    )
    monkeypatch.setattr(
        health_service_module.redis,
        "Redis",
        lambda **_: FakeRedisClient(),
    )

    service = health_service_module.HealthService()
    result = await service.get_health_status()

    assert result.status == "healthy"
    assert result.checks == {"database": True, "redis": True}


@pytest.mark.asyncio
async def test_health_service_readiness_fails_on_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeRedisClient:
        def ping(self) -> None:
            return None

        def close(self) -> None:
            return None

    monkeypatch.setattr(health_service_module, "get_settings", _health_settings)
    monkeypatch.setattr(
        health_service_module,
        "check_database_connection",
        lambda: _resolved(False),
    )
    monkeypatch.setattr(
        health_service_module.redis,
        "Redis",
        lambda **_: FakeRedisClient(),
    )

    service = health_service_module.HealthService()
    result = await service.get_readiness_status()

    assert result.ready is False
    assert result.status == "not ready - database"


@pytest.mark.asyncio
async def test_health_service_database_health_handles_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _boom() -> bool:
        raise RuntimeError("db down")

    monkeypatch.setattr(health_service_module, "get_settings", _health_settings)
    monkeypatch.setattr(health_service_module, "check_database_connection", _boom)
    monkeypatch.setattr(
        health_service_module.redis,
        "Redis",
        lambda **_: SimpleNamespace(ping=lambda: None, close=lambda: None),
    )

    service = health_service_module.HealthService()
    assert await service._database_health() is False


def test_health_service_redis_health_handles_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeRedisClient:
        def __init__(self) -> None:
            self.closed = False

        def ping(self) -> None:
            raise RuntimeError("redis down")

        def close(self) -> None:
            self.closed = True

    client = FakeRedisClient()
    monkeypatch.setattr(health_service_module, "get_settings", _health_settings)
    monkeypatch.setattr(health_service_module.redis, "Redis", lambda **_: client)

    service = health_service_module.HealthService()
    assert service._redis_health() is False
    assert client.closed is True


@pytest.mark.asyncio
async def test_health_routes_use_service(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_service = SimpleNamespace(
        get_health_status=lambda: _resolved(
            HealthCheckResult(
                status="degraded",
                timestamp="2026-01-01T00:00:00",
                version="1.0.0",
                worker_host="worker-x",
                checks={"database": False, "redis": True},
            )
        ),
        get_readiness_status=lambda: _resolved(
            ReadinessResult(ready=False, status="not ready - redis")
        ),
    )
    monkeypatch.setattr(api_health_module, "get_health_service", lambda: fake_service)

    health = await api_health_module.health_check()
    live = await api_health_module.liveness_probe()
    response = Response()
    ready = await api_health_module.readiness_probe(response)

    assert health.status == "degraded"
    assert live.status == "alive"
    assert ready.status == "not ready - redis"
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_rag_service_document_search_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    citation = RagCitation(
        chunk_id="chunk-1",
        document_id="doc-1",
        snippet="snippet",
        score=0.9,
        start_offset=0,
        end_offset=10,
    )
    hit = DocumentSearchHit(
        document_id="doc-1",
        score=0.9,
        best_snippet="best",
        citations=[citation],
    )

    class FakeOrchestrator:
        async def document_search(self, **kwargs):
            return "rewritten query", [hit]

        async def answer(self, **kwargs):
            return SimpleNamespace(
                answer="answer",
                citations=[citation],
                confidence="high",
                rewritten_query="rewritten",
            )

    monkeypatch.setattr(rag_service_module, "QueryOrchestrator", FakeOrchestrator)

    service = rag_service_module.RagService()
    search_result = await service.execute_document_search(
        user_id="user-1",
        query="hello",
        limit=5,
        mode="hybrid",
    )
    answer_result = await service.execute_answer(
        user_id="user-1",
        query="hello",
        mode="hybrid",
        max_context_results=5,
    )

    assert search_result.rewritten_query == "rewritten query"
    assert len(search_result.documents) == 1
    assert answer_result.answer == "answer"
    assert answer_result.confidence == "high"


@pytest.mark.asyncio
async def test_rag_service_wraps_orchestrator_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FailingOrchestrator:
        async def document_search(self, **kwargs):
            raise RuntimeError("search failed")

        async def answer(self, **kwargs):
            raise RuntimeError("answer failed")

    monkeypatch.setattr(rag_service_module, "QueryOrchestrator", FailingOrchestrator)
    service = rag_service_module.RagService()

    with pytest.raises(ApiServiceError, match="RAG document search failed"):
        await service.execute_document_search(
            user_id="user-1",
            query="hello",
            limit=5,
            mode="hybrid",
        )

    with pytest.raises(ApiServiceError, match="RAG answer failed"):
        await service.execute_answer(
            user_id="user-1",
            query="hello",
            mode="hybrid",
            max_context_results=5,
        )


def test_get_rag_service_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeOrchestrator:
        async def document_search(self, **kwargs):
            return "", []

        async def answer(self, **kwargs):
            return SimpleNamespace(
                answer="",
                citations=[],
                confidence="low",
                rewritten_query=None,
            )

    monkeypatch.setattr(rag_service_module, "QueryOrchestrator", FakeOrchestrator)
    rag_service_module._rag_service = None

    first = rag_service_module.get_rag_service()
    second = rag_service_module.get_rag_service()

    assert first is second


async def _resolved(value):
    return value
