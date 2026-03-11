from __future__ import annotations

import os
import sys
import types
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from core import database as database_module
from core import langsmith as langsmith_module


def _db_settings() -> SimpleNamespace:
    return SimpleNamespace(
        database=SimpleNamespace(
            url="postgresql://user:pass@localhost:5432/db",
            async_url="postgresql+asyncpg://user:pass@localhost:5432/db",
            pool_size=5,
            max_overflow=10,
        ),
        debug=True,
    )


def test_get_sync_engine_uses_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setattr(database_module, "get_settings", _db_settings)
    monkeypatch.setattr(
        database_module,
        "create_engine",
        lambda url, **kwargs: captured.update({"url": url, "kwargs": kwargs}) or "sync-engine",
    )

    engine = database_module.get_sync_engine()
    assert engine == "sync-engine"
    assert captured["url"] == "postgresql://user:pass@localhost:5432/db"
    assert captured["kwargs"]["pool_size"] == 5
    assert captured["kwargs"]["echo"] is True


def test_get_async_engine_uses_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setattr(database_module, "get_settings", _db_settings)
    monkeypatch.setattr(
        database_module,
        "create_async_engine",
        lambda url, **kwargs: captured.update({"url": url, "kwargs": kwargs}) or "async-engine",
    )

    engine = database_module.get_async_engine()
    assert engine == "async-engine"
    assert captured["url"] == "postgresql+asyncpg://user:pass@localhost:5432/db"
    assert captured["kwargs"]["max_overflow"] == 10


def test_sync_session_factory_caches_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    database_module._sync_engine = None
    database_module._sync_session_factory = None
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(database_module, "get_sync_engine", lambda: "engine")
    monkeypatch.setattr(
        database_module,
        "sessionmaker",
        lambda **kwargs: calls.append(kwargs) or (lambda: SimpleNamespace()),
    )

    first = database_module.get_sync_session_factory()
    second = database_module.get_sync_session_factory()
    assert first is second
    assert len(calls) == 1
    assert calls[0]["bind"] == "engine"


def test_get_db_session_returns_closed_session(monkeypatch: pytest.MonkeyPatch) -> None:
    session = SimpleNamespace(closed=False, rollback=lambda: None)

    def _close():
        session.closed = True

    session.close = _close
    monkeypatch.setattr(database_module, "get_sync_session_factory", lambda: lambda: session)

    returned = database_module.get_db_session()
    assert returned is session
    assert session.closed is True


def test_async_session_factory_caches_factory(monkeypatch: pytest.MonkeyPatch) -> None:
    database_module._async_engine = None
    database_module._async_session_factory = None
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(database_module, "get_async_engine", lambda: "async-engine")
    monkeypatch.setattr(
        database_module,
        "async_sessionmaker",
        lambda **kwargs: calls.append(kwargs) or (lambda: SimpleNamespace()),
    )

    first = database_module.get_async_session_factory()
    second = database_module.get_async_session_factory()
    assert first is second
    assert len(calls) == 1
    assert calls[0]["bind"] == "async-engine"


@pytest.mark.asyncio
async def test_get_async_db_session_context_manager(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSession:
        def __init__(self) -> None:
            self.closed = False
            self.rolled_back = False

        async def rollback(self):
            self.rolled_back = True

        async def close(self):
            self.closed = True

    session = FakeSession()
    monkeypatch.setattr(database_module, "get_async_session_factory", lambda: lambda: session)

    async with database_module.get_async_db_session() as yielded:
        assert yielded is session
    assert session.closed is True
    assert session.rolled_back is False


@pytest.mark.asyncio
async def test_get_async_db_session_rolls_back_on_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeSession:
        def __init__(self) -> None:
            self.closed = False
            self.rolled_back = False

        async def rollback(self):
            self.rolled_back = True

        async def close(self):
            self.closed = True

    session = FakeSession()
    monkeypatch.setattr(database_module, "get_async_session_factory", lambda: lambda: session)

    with pytest.raises(RuntimeError, match="boom"):
        async with database_module.get_async_db_session():
            raise RuntimeError("boom")

    assert session.rolled_back is True
    assert session.closed is True


@pytest.mark.asyncio
async def test_check_database_connection_success(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSession:
        async def execute(self, _query):
            return None

    @asynccontextmanager
    async def fake_context():
        yield FakeSession()

    monkeypatch.setattr(database_module, "get_async_db_session", fake_context)
    assert await database_module.check_database_connection() is True


@pytest.mark.asyncio
async def test_check_database_connection_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeSession:
        async def execute(self, _query):
            raise RuntimeError("db down")

    @asynccontextmanager
    async def fake_context():
        yield FakeSession()

    monkeypatch.setattr(database_module, "get_async_db_session", fake_context)
    assert await database_module.check_database_connection() is False


def test_validate_schema_sync_detects_drift(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeColumn:
        def __init__(self, name: str) -> None:
            self.name = name

    class FakeTable:
        def __init__(self, name: str, columns: list[str]) -> None:
            self.name = name
            self.columns = [FakeColumn(column) for column in columns]

    fake_base = SimpleNamespace(
        metadata=SimpleNamespace(sorted_tables=[FakeTable("users", ["id", "email"])])
    )

    import db.base as db_base_module

    monkeypatch.setattr(db_base_module, "Base", fake_base)
    monkeypatch.setattr(database_module, "MANAGED_TABLES", frozenset({"users"}))
    monkeypatch.setattr(
        database_module,
        "inspect",
        lambda engine: SimpleNamespace(
            get_columns=lambda table_name: [{"name": "id"}, {"name": "extra_col"}]
        ),
    )

    disposed = {"value": False}
    fake_engine = SimpleNamespace(dispose=lambda: disposed.__setitem__("value", True))
    monkeypatch.setattr(database_module, "get_sync_engine", lambda: fake_engine)

    drifts = database_module.validate_schema_sync()
    assert any("email" in drift for drift in drifts)
    assert any("extra_col" in drift for drift in drifts)
    assert disposed["value"] is True


def test_initialize_langsmith_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    langsmith_module._langsmith_enabled = True

    assert langsmith_module.initialize_langsmith() is False
    assert langsmith_module.is_langsmith_enabled() is False


def test_initialize_langsmith_with_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LANGSMITH_API_KEY", "key-1")
    monkeypatch.setenv("LANGSMITH_PROJECT", "proj-1")
    monkeypatch.setenv("LANGSMITH_ENDPOINT", "http://langsmith")
    langsmith_module._langsmith_enabled = False

    assert langsmith_module.initialize_langsmith() is True
    assert langsmith_module.is_langsmith_enabled() is True
    assert os.environ.get("LANGCHAIN_API_KEY") == "key-1"


def test_trace_llm_call_and_wrappers(monkeypatch: pytest.MonkeyPatch) -> None:
    langsmith_module._langsmith_enabled = False

    def fn(value: int) -> int:
        return value + 1

    undecorated = langsmith_module.trace_llm_call("run")(fn)
    assert undecorated(1) == 2

    fake_langsmith = types.ModuleType("langsmith")
    fake_langsmith.traceable = lambda **_: lambda wrapped: lambda *a, **kw: wrapped(*a, **kw)
    fake_wrappers = types.ModuleType("langsmith.wrappers")
    fake_wrappers.wrap_openai = lambda client: {"wrapped": client}
    sys.modules["langsmith"] = fake_langsmith
    sys.modules["langsmith.wrappers"] = fake_wrappers
    langsmith_module._langsmith_enabled = True

    decorated = langsmith_module.trace_llm_call("run")(fn)
    assert decorated(2) == 3
    assert langsmith_module.wrap_openai_client({"client": True}) == {"wrapped": {"client": True}}

    # Force wrapper failure branch.
    fake_wrappers.wrap_openai = lambda client: (_ for _ in ()).throw(RuntimeError("boom"))
    assert langsmith_module.wrap_openai_client({"client": True}) == {"client": True}


def test_create_langsmith_run_and_client(monkeypatch: pytest.MonkeyPatch) -> None:
    langsmith_module._langsmith_enabled = False
    with langsmith_module.create_langsmith_run("run"):
        pass
    assert langsmith_module.get_langsmith_client() is None

    fake_langsmith = types.ModuleType("langsmith")
    fake_langsmith.Client = lambda: {"client": True}
    fake_helpers = types.ModuleType("langsmith.run_helpers")
    fake_helpers.trace = lambda **kwargs: SimpleNamespace(
        __enter__=lambda self: None, __exit__=lambda self, exc_type, exc, tb: False
    )
    sys.modules["langsmith"] = fake_langsmith
    sys.modules["langsmith.run_helpers"] = fake_helpers
    langsmith_module._langsmith_enabled = True

    run_context = langsmith_module.create_langsmith_run("run", inputs={"a": 1})
    assert run_context is not None
    assert langsmith_module.get_langsmith_client() == {"client": True}
