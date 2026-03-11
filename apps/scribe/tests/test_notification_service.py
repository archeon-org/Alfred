from __future__ import annotations

from typing import Any

import httpx

from services import notification as notification_module
from services.notification import (
    CreateNotificationDTO,
    NotificationService,
    NotificationType,
    is_expo_push_token,
)


class _ExecuteResult:
    def __init__(self, row: object | None) -> None:
        self._row = row

    def fetchone(self) -> object | None:
        return self._row


class _FakeSession:
    def __init__(self, rows: list[object | None]) -> None:
        self._rows = list(rows)
        self.calls: list[tuple[object, object | None]] = []
        self.commits = 0

    def execute(self, statement: object, params: object | None = None) -> _ExecuteResult:
        self.calls.append((statement, params))
        row = self._rows.pop(0) if self._rows else None
        return _ExecuteResult(row)

    def commit(self) -> None:
        self.commits += 1


def test_is_expo_push_token_validation() -> None:
    assert is_expo_push_token("ExpoPushToken[abc123]") is True
    assert is_expo_push_token("ExponentPushToken[abc123]") is True
    assert is_expo_push_token("invalid-token") is False
    assert is_expo_push_token(None) is False


def test_create_returns_none_when_user_missing() -> None:
    service = NotificationService()
    session = _FakeSession(rows=[None])

    notification_id = service.create(
        session,
        CreateNotificationDTO(
            user_id="user-1",
            title="Title",
            message="Message",
        ),
    )

    assert notification_id is None
    assert session.commits == 0


def test_create_returns_none_when_notification_type_disabled() -> None:
    service = NotificationService()
    session = _FakeSession(
        rows=[
            (
                "user-1",
                {"pushNotifications": {"processingError": False}},
                "ExpoPushToken[token-1]",
            )
        ]
    )

    notification_id = service.create(
        session,
        CreateNotificationDTO(
            user_id="user-1",
            title="Title",
            message="Message",
            notification_type=NotificationType.DOCUMENT_ERROR,
        ),
    )

    assert notification_id is None
    assert session.commits == 0


def test_create_persists_notification_and_dispatches_push() -> None:
    service = NotificationService()
    session = _FakeSession(
        rows=[
            (
                "user-1",
                {"pushNotifications": {"systemAlerts": True}},
                "ExpoPushToken[token-1]",
            ),
            None,
        ]
    )
    sent: dict[str, Any] = {}
    service._send_push_notification = lambda **kwargs: sent.update(kwargs)  # type: ignore[method-assign]

    notification_id = service.create(
        session,
        CreateNotificationDTO(
            user_id="user-1",
            title="Created",
            message="Body",
            redirect="/docs/1",
            notification_type=NotificationType.SYSTEM,
            data={"kind": "system"},
        ),
    )

    assert notification_id is not None
    assert session.commits == 1
    assert sent["user_id"] == "user-1"
    assert sent["title"] == "Created"
    assert sent["body"] == "Body"
    assert sent["data"]["kind"] == "system"
    assert sent["data"]["notificationId"] == notification_id


def test_send_push_notification_success_path() -> None:
    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"data": {"status": "ok", "id": "ticket-1"}}

    class _FakeHttpClient:
        def __init__(self) -> None:
            self.last_url = ""
            self.last_payload: dict[str, object] = {}

        def post(self, url: str, json: dict[str, object]) -> _FakeResponse:  # noqa: A002
            self.last_url = url
            self.last_payload = json
            return _FakeResponse()

    service = NotificationService()
    fake_client = _FakeHttpClient()
    service._http_client = fake_client

    service._send_push_notification(
        push_token="ExpoPushToken[token-1]",  # noqa: S106
        title="title",
        body="body",
        data={"x": 1},
        user_id="user-1",
    )

    assert "exp.host" in fake_client.last_url
    assert fake_client.last_payload["to"] == "ExpoPushToken[token-1]"
    assert fake_client.last_payload["data"] == {"x": 1}


def test_send_push_notification_handles_missing_or_invalid_token() -> None:
    class _NoCallHttpClient:
        def post(self, url: str, json: dict[str, object]) -> None:  # noqa: ARG002, A002
            raise AssertionError("HTTP client must not be called")

    service = NotificationService()
    service._http_client = _NoCallHttpClient()

    service._send_push_notification(
        push_token=None,
        title="title",
        body="body",
        data={},
        user_id="user-1",
    )
    service._send_push_notification(
        push_token="bad-token",  # noqa: S106
        title="title",
        body="body",
        data={},
        user_id="user-1",
    )


def test_send_push_notification_handles_http_and_request_errors() -> None:
    class _StatusErrorClient:
        def post(self, url: str, json: dict[str, object]) -> None:  # noqa: ARG002, A002
            request = httpx.Request("POST", url)
            response = httpx.Response(503, request=request, text="upstream down")
            raise httpx.HTTPStatusError("failed", request=request, response=response)

    class _RequestErrorClient:
        def post(self, url: str, json: dict[str, object]) -> None:  # noqa: ARG002, A002
            request = httpx.Request("POST", url)
            raise httpx.RequestError("network", request=request)

    service = NotificationService()
    service._http_client = _StatusErrorClient()
    service._send_push_notification(
        push_token="ExpoPushToken[token-1]",  # noqa: S106
        title="title",
        body="body",
        data={},
        user_id="user-1",
    )

    service._http_client = _RequestErrorClient()
    service._send_push_notification(
        push_token="ExpoPushToken[token-1]",  # noqa: S106
        title="title",
        body="body",
        data={},
        user_id="user-1",
    )


def test_get_notification_service_is_singleton(monkeypatch) -> None:
    monkeypatch.setattr(notification_module, "_notification_service", None)

    first = notification_module.get_notification_service()
    second = notification_module.get_notification_service()

    assert first is second
