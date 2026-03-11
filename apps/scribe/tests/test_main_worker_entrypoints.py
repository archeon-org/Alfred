from __future__ import annotations

import sys
from types import SimpleNamespace

from fastapi.testclient import TestClient

import main as main_module
import worker as worker_module


def _base_settings(is_production: bool) -> SimpleNamespace:
    return SimpleNamespace(
        env="production" if is_production else "development",
        api_host="0.0.0.0",  # noqa: S104
        api_port=8000,
        worker_host="scribe-worker",
        trusted_hosts_list=["example.com"],
        is_production=is_production,
        uvicorn_workers=3,
        uvicorn_limit_concurrency=321,
        uvicorn_timeout_keep_alive=11,
        uvicorn_backlog=1234,
        log_level="INFO",
    )


def test_create_app_enables_docs_in_non_production(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "get_settings", lambda: _base_settings(False))
    app = main_module.create_app()

    assert app.docs_url == "/docs"
    assert app.redoc_url == "/redoc"
    assert app.openapi_url == "/openapi.json"

    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["service"] == "archeon-scribe"


def test_create_app_disables_docs_in_production(monkeypatch) -> None:
    monkeypatch.setattr(main_module, "get_settings", lambda: _base_settings(True))
    app = main_module.create_app()

    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


def test_main_invokes_uvicorn_with_expected_settings(monkeypatch) -> None:
    calls: dict[str, object] = {}
    monkeypatch.setattr(main_module, "get_settings", lambda: _base_settings(True))
    monkeypatch.setitem(
        sys.modules,
        "uvicorn",
        SimpleNamespace(run=lambda *args, **kwargs: calls.update({"args": args, "kwargs": kwargs})),
    )

    main_module.main()

    assert calls["args"][0] == "main:app"
    assert calls["kwargs"]["workers"] == 3
    assert calls["kwargs"]["reload"] is False
    assert calls["kwargs"]["limit_concurrency"] == 321


def test_worker_main_starts_celery_worker(monkeypatch) -> None:
    calls: dict[str, object] = {}
    monkeypatch.setattr(
        worker_module,
        "get_settings",
        lambda: SimpleNamespace(worker_host="scribe-worker", worker_concurrency=4),
    )
    monkeypatch.setattr(
        worker_module.celery_app,
        "worker_main",
        lambda args: calls.update({"args": args}),
    )

    worker_module.main()

    args = calls["args"]
    assert "--concurrency=4" in args
    assert "--queues=celery" in args
    assert args[0] == "worker"
