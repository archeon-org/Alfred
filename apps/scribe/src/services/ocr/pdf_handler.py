"""
PDF Handler

Single Responsibility: Handle PDF-specific operations.
- Detect PDF format
- Extract embedded text (searchable PDFs)
- Convert pages to images for OCR
"""

import os
import subprocess
from dataclasses import dataclass

from core.logging import get_logger
from services.ocr.temp_file_manager import TempFileManager
from services.ocr.text_quality import TextQualityChecker
from services.ocr.image_handler import ImageHandler

logger = get_logger(__name__)


@dataclass
class PDFConfig:
    """Configuration for PDF processing."""

    max_pages: int = 50
    default_dpi: int = 150
    pdftoppm_timeout: int = 120  # 2 minutes
    dpi_chain: tuple[int, ...] = (150, 100, 75)
    early_stop_pages: int = 2
    page_separator: str = "\n\n--- Page Break ---\n\n"


class PDFHandler:
    """
    Handles PDF-specific OCR operations.

    Single Responsibility: Only handles PDF detection,
    embedded text extraction, and page conversion.
    """

    def __init__(
        self,
        image_handler: ImageHandler,
        quality_checker: TextQualityChecker,
        config: PDFConfig | None = None,
    ):
        self._image_handler = image_handler
        self._quality_checker = quality_checker
        self._config = config or PDFConfig()

    @staticmethod
    def is_pdf(data: bytes) -> bool:
        """Check if file is a PDF based on magic bytes."""
        header = data[:1024].decode("ascii", errors="ignore")
        return "%PDF" in header

    def extract_text(self, pdf_data: bytes) -> str:
        """
        Extract text from PDF.

        Strategy:
        1. Try embedded text extraction first (fast)
        2. Fall back to OCR if needed

        Args:
            pdf_data: Raw PDF bytes

        Returns:
            Extracted text
        """
        # Try embedded text first (much faster)
        embedded_text = self._extract_embedded_text(pdf_data)
        if embedded_text:
            logger.info("Extracted embedded text", chars=len(embedded_text))
            return embedded_text

        # Fall back to OCR
        logger.info("No embedded text, performing OCR on PDF")
        return self._ocr_pdf(pdf_data)

    def _extract_embedded_text(self, pdf_data: bytes) -> str | None:
        """Extract text from searchable PDF using pdftotext."""
        with TempFileManager.temp_directory(prefix="pdf-embed-") as tmp_dir:
            pdf_path = TempFileManager.write_file(tmp_dir, "input.pdf", pdf_data)

            try:
                # First, check if the PDF has embedded text by sampling first 2 pages
                sample_result = subprocess.run(
                    ["pdftotext", "-l", "2", pdf_path, "-"],
                    capture_output=True,
                    timeout=10,
                    text=True,
                )

                if sample_result.returncode != 0:
                    return None

                sample_text = sample_result.stdout.strip()
                if not self._quality_checker.is_successful(sample_text):
                    # No good embedded text in first 2 pages, fall back to OCR
                    return None

                # Good embedded text found! Now extract ALL pages
                full_result = subprocess.run(
                    ["pdftotext", "-l", str(self._config.max_pages), pdf_path, "-"],
                    capture_output=True,
                    timeout=60,  # More time for full document
                    text=True,
                )

                if full_result.returncode == 0:
                    text = full_result.stdout.strip()
                    logger.info("Extracted embedded text from entire document", chars=len(text))
                    return text

            except subprocess.TimeoutExpired:
                logger.debug("pdftotext timeout")
            except FileNotFoundError:
                logger.debug("pdftotext not installed")
            except Exception as e:
                logger.warning("Failed to extract embedded text", error=str(e))

        return None

    def _ocr_pdf(self, pdf_data: bytes) -> str:
        """Process PDF by converting pages to images and running OCR."""
        with TempFileManager.temp_directory(prefix="pdf-ocr-") as tmp_dir:
            pdf_path = TempFileManager.write_file(tmp_dir, "input.pdf", pdf_data)

            # Select starting DPI based on file size
            start_dpi_idx = self._select_starting_dpi(len(pdf_data))
            last_error: Exception | None = None

            # Try DPI chain until successful
            for dpi_idx in range(start_dpi_idx, len(self._config.dpi_chain)):
                dpi = self._config.dpi_chain[dpi_idx]
                logger.debug(f"Attempting PDF conversion at {dpi} DPI")

                try:
                    result = self._process_at_dpi(tmp_dir, pdf_path, dpi)

                    if self._quality_checker.is_successful(result):
                        return result

                    # Clean up page files for retry
                    TempFileManager.cleanup_files(tmp_dir, "page-", ".png")

                except Exception as e:
                    last_error = e
                    logger.warning(f"OCR failed at {dpi} DPI", error=str(e))
                    TempFileManager.cleanup_files(tmp_dir, "page-", ".png")

            if last_error:
                raise last_error

            return ""

    def _select_starting_dpi(self, file_size: int) -> int:
        """Select starting DPI index based on file size."""
        size_mb = file_size / (1024 * 1024)
        if size_mb < 5:
            return 0
        elif size_mb < 20:
            return 1
        else:
            return 2

    def _process_at_dpi(self, tmp_dir: str, pdf_path: str, dpi: int) -> str:
        """Process PDF at a specific DPI."""
        output_prefix = os.path.join(tmp_dir, "page")

        # Convert PDF to PNG using pdftoppm
        result = subprocess.run(
            [
                "pdftoppm",
                "-png",
                "-gray",
                "-r",
                str(dpi),
                "-l",
                str(self._config.max_pages),
                pdf_path,
                output_prefix,
            ],
            capture_output=True,
            timeout=self._config.pdftoppm_timeout,
        )

        if result.returncode != 0:
            raise RuntimeError(f"pdftoppm failed: {result.stderr.decode()}")

        # Find page files
        page_files = TempFileManager.list_files(tmp_dir, "page-", ".png")
        if not page_files:
            raise RuntimeError("No pages extracted from PDF")

        logger.debug(f"Extracted {len(page_files)} pages at {dpi} DPI")

        # Process pages with smart early stopping
        return self._ocr_pages(tmp_dir, page_files)

    def _ocr_pages(self, tmp_dir: str, page_files: list[str]) -> str:
        """OCR each page - process ALL pages for complete document extraction."""
        text_parts: list[str] = []

        for i, page_file in enumerate(page_files):
            page_path = os.path.join(tmp_dir, page_file)
            page_buffer = TempFileManager.read_binary(page_path)

            page_text = self._image_handler.extract_text(page_buffer)
            trimmed_text = page_text.strip()
            text_parts.append(trimmed_text)

            if (i + 1) % 10 == 0:
                logger.debug(f"OCR progress: {i + 1}/{len(page_files)} pages")

        full_text = self._config.page_separator.join(text_parts)
        logger.info(f"OCR completed: {len(page_files)} pages, {len(full_text)} chars")

        return full_text
