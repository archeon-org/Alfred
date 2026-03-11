import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar

T = TypeVar("T")

_worker_loop: asyncio.AbstractEventLoop | None = None


def _get_worker_loop() -> asyncio.AbstractEventLoop:
    global _worker_loop

    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(_worker_loop)

    return _worker_loop


def run_coroutine_sync(coro: Coroutine[Any, Any, T]) -> T:
    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if running_loop is not None and running_loop.is_running():
        raise RuntimeError("run_coroutine_sync cannot be used from an active event loop")

    loop = _get_worker_loop()
    return loop.run_until_complete(coro)
