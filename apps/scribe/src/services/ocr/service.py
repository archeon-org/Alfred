"""
OCR Service

Facade that orchestrates PDF and Image handlers.
KISS: Simple public API, complexity hidden in handlers.
"""

from core.config import get_settings
from core.logging import get_logger
from services.ocr.image_handler import ImageHandler
from services.ocr.pdf_handler import PDFHandler, PDFConfig
from services.ocr.text_quality import TextQualityChecker

logger = get_logger(__name__)


class OCRService:
    """
    Service for OCR text extraction from images and PDFs.

    This is a facade that orchestrates:
    - PDFHandler: PDF detection and processing
    - ImageHandler: Tesseract OCR for images
    - TextQualityChecker: Extraction validation

    KISS: Simple public API (recognize method).
    """

    def __init__(self) -> None:
        settings = get_settings()
        ocr_settings = settings.ocr

        # Create handlers with settings
        self._image_handler = ImageHandler(
            lang=ocr_settings.tesseract_lang,
            oem=ocr_settings.tesseract_oem,
            psm=ocr_settings.tesseract_psm,
            timeout=ocr_settings.tesseract_timeout,
        )

        self._quality_checker = TextQualityChecker()

        self._pdf_handler = PDFHandler(
            image_handler=self._image_handler,
            quality_checker=self._quality_checker,
            config=PDFConfig(
                max_pages=ocr_settings.pdf_max_pages,
                default_dpi=ocr_settings.pdf_dpi,
            ),
        )

        logger.info(
            "OCR service initialized",
            lang=ocr_settings.tesseract_lang,
            psm=ocr_settings.tesseract_psm,
            max_pages=ocr_settings.pdf_max_pages,
        )

    def recognize(self, file_data: bytes, mimetype: str | None = None) -> str:
        """
        Extract text from an image or PDF file.

        Args:
            file_data: Raw file bytes
            mimetype: Optional MIME type hint (unused, kept for API compat)

        Returns:
            Extracted text content

        Raises:
            Exception: If OCR fails
        """
        logger.debug("Starting OCR", size=len(file_data), mimetype=mimetype)

        if PDFHandler.is_pdf(file_data):
            logger.info("PDF detected")
            return self._pdf_handler.extract_text(file_data)
        else:
            logger.info("Processing as image")
            return self._image_handler.extract_text(file_data)


# Singleton instance
_ocr_service: OCRService | None = None


def get_ocr_service() -> OCRService:
    """Get or create OCR service singleton."""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
