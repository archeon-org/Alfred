import base64

import httpx

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class OCRService:
    def __init__(self) -> None:
        settings = get_settings()
        ocr_settings = settings.ocr

        self._base_url = ocr_settings.mistral_base_url.rstrip("/")
        self._api_key = ocr_settings.mistral_api_key.get_secret_value()
        self._model = ocr_settings.mistral_model
        self._timeout = ocr_settings.mistral_timeout
        self._table_format = ocr_settings.mistral_table_format
        self._extract_header = ocr_settings.mistral_extract_header
        self._extract_footer = ocr_settings.mistral_extract_footer
        self._max_pages = ocr_settings.pdf_max_pages

        logger.info(
            "OCR service initialized with Mistral",
            model=self._model,
            max_pages=self._max_pages,
        )

    def recognize(self, file_data: bytes, mimetype: str | None = None) -> str:
        logger.debug("Starting OCR", size=len(file_data), mimetype=mimetype)

        if not self._api_key:
            raise RuntimeError("MISTRAL_OCR_API_KEY is not configured")

        detected_mimetype = (mimetype or self._detect_mimetype(file_data)).lower()
        is_image = detected_mimetype.startswith("image/")
        input_type = "image_url" if is_image else "document_url"
        input_key = "image_url" if is_image else "document_url"
        data_url = self._to_data_url(file_data, detected_mimetype)

        payload: dict[str, object] = {
            "model": self._model,
            "document": {
                "type": input_type,
                input_key: data_url,
            },
        }
        if self._table_format != "none":
            payload["table_format"] = self._table_format
        if self._extract_header:
            payload["extract_header"] = True
        if self._extract_footer:
            payload["extract_footer"] = True

        url = f"{self._base_url}/ocr"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Mistral OCR request failed",
                status_code=exc.response.status_code,
                response_text=exc.response.text[:1000],
            )
            raise
        except Exception:
            logger.exception("Mistral OCR request failed")
            raise

        result = response.json()
        pages = result.get("pages", [])
        if not isinstance(pages, list):
            raise RuntimeError("Invalid OCR response format: pages is not a list")

        selected_pages = pages if self._max_pages <= 0 else pages[: self._max_pages]
        chunks: list[str] = []
        for page in selected_pages:
            if isinstance(page, dict):
                markdown = page.get("markdown")
                if isinstance(markdown, str) and markdown.strip():
                    chunks.append(markdown.strip())

        text = "\n\n".join(chunks).strip()
        logger.info(
            "OCR completed",
            pages_total=len(pages),
            pages=len(selected_pages),
            chars=len(text),
            input_type=input_type,
        )
        return text

    @staticmethod
    def _to_data_url(file_data: bytes, mimetype: str) -> str:
        encoded = base64.b64encode(file_data).decode("ascii")
        return f"data:{mimetype};base64,{encoded}"

    @staticmethod
    def _detect_mimetype(file_data: bytes) -> str:
        if file_data.startswith(b"%PDF"):
            return "application/pdf"
        if file_data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if file_data.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if file_data.startswith((b"GIF87a", b"GIF89a")):
            return "image/gif"
        if file_data.startswith(b"BM"):
            return "image/bmp"
        if file_data.startswith((b"II*\x00", b"MM\x00*")):
            return "image/tiff"
        if file_data[0:4] == b"RIFF" and file_data[8:12] == b"WEBP":
            return "image/webp"
        return "application/octet-stream"


_ocr_service: OCRService | None = None


def get_ocr_service() -> OCRService:
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
