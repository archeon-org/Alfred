from __future__ import annotations

import core.celery_app as celery_app_module


def test_task_prerun_and_postrun_handlers(monkeypatch) -> None:
    info_calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(
        celery_app_module.logger,
        "info",
        lambda *args, **kwargs: info_calls.append((args, kwargs)),
    )

    celery_app_module.task_prerun_handler(
        task_id="task-1",
        task=type("Task", (), {"name": "demo.task"})(),
        args=(),
        kwargs={},
    )
    celery_app_module.task_postrun_handler(
        task_id="task-1",
        task=object(),
        args=(),
        kwargs={},
        retval=None,
        state="SUCCESS",
    )

    assert info_calls[0][0][0] == "Task started"
    assert info_calls[1][0][0] == "Task completed"


def test_task_failure_handler(monkeypatch) -> None:
    error_calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(
        celery_app_module.logger,
        "error",
        lambda *args, **kwargs: error_calls.append((args, kwargs)),
    )

    celery_app_module.task_failure_handler(
        task_id="task-2",
        exception=RuntimeError("boom"),
        args=(),
        kwargs={},
        traceback=None,
    )

    assert error_calls[0][0][0] == "Task failed"
    assert error_calls[0][1]["error"] == "boom"


def test_worker_process_init_handler_langsmith_enabled(monkeypatch) -> None:
    info_calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(
        celery_app_module.logger,
        "info",
        lambda *args, **kwargs: info_calls.append((args, kwargs)),
    )

    import core.langsmith as langsmith_module

    monkeypatch.setattr(langsmith_module, "initialize_langsmith", lambda: True)
    celery_app_module.worker_process_init_handler()

    assert any(
        "LangSmith LLM tracing enabled in worker process" in call[0][0] for call in info_calls
    )


def test_worker_process_init_handler_handles_errors(monkeypatch) -> None:
    debug_calls: list[tuple[tuple, dict]] = []
    monkeypatch.setattr(
        celery_app_module.logger,
        "debug",
        lambda *args, **kwargs: debug_calls.append((args, kwargs)),
    )

    import core.langsmith as langsmith_module

    monkeypatch.setattr(
        langsmith_module,
        "initialize_langsmith",
        lambda: (_ for _ in ()).throw(RuntimeError("init failed")),
    )
    celery_app_module.worker_process_init_handler()

    assert any("LangSmith initialization skipped in worker" in call[0][0] for call in debug_calls)
