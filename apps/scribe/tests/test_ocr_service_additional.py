from __future__ import annotations

import httpx
import pytest

from services.ocr import service as ocr_module
from services.ocr.service import OCRService


class _Secret:
    def __init__(self, value: str) -> None:
        self._value = value

    def get_secret_value(self) -> str:
        return self._value


def _settings(
    *,
    api_key: str = "api-key",
    table_format: str = "markdown",
    extract_header: bool = True,
    extract_footer: bool = True,
    max_pages: int = 2,
):
    return type(
        "Settings",
        (),
        {
            "ocr": type(
                "OCRSettings",
                (),
                {
                    "mistral_base_url": "https://ocr.test",
                    "mistral_api_key": _Secret(api_key),
                    "mistral_model": "mistral-ocr-latest",
                    "mistral_timeout": 9.5,
                    "mistral_table_format": table_format,
                    "mistral_extract_header": extract_header,
                    "mistral_extract_footer": extract_footer,
                    "pdf_max_pages": max_pages,
                },
            )()
        },
    )()


def test_recognize_pdf_success_builds_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {
                "pages": [
                    {"markdown": "page one"},
                    {"markdown": "page two"},
                    {"markdown": "page three"},
                ]
            }

    class _FakeClient:
        def __init__(self, timeout: float) -> None:
            captured["timeout"] = timeout

        def __enter__(self) -> _FakeClient:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
            return None

        def post(self, url: str, headers: dict[str, str], json: dict[str, object]) -> _FakeResponse:  # noqa: A002
            captured["url"] = url
            captured["headers"] = headers
            captured["payload"] = json
            return _FakeResponse()

    monkeypatch.setattr(ocr_module, "get_settings", lambda: _settings())
    monkeypatch.setattr(ocr_module.httpx, "Client", _FakeClient)

    service = OCRService()
    text = service.recognize(b"%PDF-1.4\nfile")

    assert text == "page one\n\npage two"
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["document"]["type"] == "document_url"  # type: ignore[index]
    assert "table_format" in payload
    assert payload["extract_header"] is True  # type: ignore[index]
    assert payload["extract_footer"] is True  # type: ignore[index]


def test_recognize_image_uses_image_payload_and_omits_optional_flags(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"pages": [{"markdown": "image text"}]}

    class _FakeClient:
        def __init__(self, timeout: float) -> None:  # noqa: ARG002
            return None

        def __enter__(self) -> _FakeClient:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
            return None

        def post(self, url: str, headers: dict[str, str], json: dict[str, object]) -> _FakeResponse:  # noqa: ARG002, A002
            captured["payload"] = json
            return _FakeResponse()

    monkeypatch.setattr(
        ocr_module,
        "get_settings",
        lambda: _settings(
            table_format="none",
            extract_header=False,
            extract_footer=False,
            max_pages=0,
        ),
    )
    monkeypatch.setattr(ocr_module.httpx, "Client", _FakeClient)

    service = OCRService()
    text = service.recognize(b"\x89PNG\r\n\x1a\nbinary")

    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert text == "image text"
    assert payload["document"]["type"] == "image_url"  # type: ignore[index]
    assert "table_format" not in payload
    assert "extract_header" not in payload
    assert "extract_footer" not in payload


def test_recognize_raises_when_api_key_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ocr_module, "get_settings", lambda: _settings(api_key=""))
    service = OCRService()

    with pytest.raises(RuntimeError, match="MISTRAL_OCR_API_KEY"):
        service.recognize(b"%PDF-1.4\nfile")


def test_recognize_raises_on_invalid_pages_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"pages": "not-a-list"}

    class _FakeClient:
        def __init__(self, timeout: float) -> None:  # noqa: ARG002
            return None

        def __enter__(self) -> _FakeClient:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
            return None

        def post(self, url: str, headers: dict[str, str], json: dict[str, object]) -> _FakeResponse:  # noqa: ARG002, A002
            return _FakeResponse()

    monkeypatch.setattr(ocr_module, "get_settings", lambda: _settings())
    monkeypatch.setattr(ocr_module.httpx, "Client", _FakeClient)
    service = OCRService()

    with pytest.raises(RuntimeError, match="pages is not a list"):
        service.recognize(b"%PDF-1.4\nfile")


def test_recognize_handles_http_status_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeClient:
        def __init__(self, timeout: float) -> None:  # noqa: ARG002
            return None

        def __enter__(self) -> _FakeClient:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
            return None

        def post(self, url: str, headers: dict[str, str], json: dict[str, object]):  # noqa: ARG002, A002
            request = httpx.Request("POST", url)
            response = httpx.Response(500, request=request, text="ocr failed")
            return response

    monkeypatch.setattr(ocr_module, "get_settings", lambda: _settings())
    monkeypatch.setattr(ocr_module.httpx, "Client", _FakeClient)
    service = OCRService()

    with pytest.raises(httpx.HTTPStatusError):
        service.recognize(b"%PDF-1.4\nfile")


def test_recognize_handles_unexpected_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeClient:
        def __init__(self, timeout: float) -> None:  # noqa: ARG002
            return None

        def __enter__(self) -> _FakeClient:
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # noqa: ANN001
            return None

        def post(self, url: str, headers: dict[str, str], json: dict[str, object]):  # noqa: ARG002, A002
            raise RuntimeError("network down")

    monkeypatch.setattr(ocr_module, "get_settings", lambda: _settings())
    monkeypatch.setattr(ocr_module.httpx, "Client", _FakeClient)
    service = OCRService()

    with pytest.raises(RuntimeError, match="network down"):
        service.recognize(b"%PDF-1.4\nfile")


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (b"GIF89a123", "image/gif"),
        (b"BM123", "image/bmp"),
        (b"II*\x00123", "image/tiff"),
        (b"RIFF1234WEBP5678", "image/webp"),
    ],
)
def test_detect_mimetype_additional_variants(payload: bytes, expected: str) -> None:
    assert OCRService._detect_mimetype(payload) == expected
