"""
Image Handler

Single Responsibility: Run Tesseract OCR on image buffers.
KISS: One method, one job.
"""

import os
import subprocess

from core.logging import get_logger
from services.ocr.temp_file_manager import TempFileManager

logger = get_logger(__name__)


class ImageHandler:
    """
    Handles OCR for single images using Tesseract.

    Single Responsibility: Only runs Tesseract on images.
    """

    DEFAULT_TIMEOUT = 60  # 60 seconds per image

    def __init__(
        self,
        lang: str = "eng",
        oem: int = 1,
        psm: int = 3,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self._lang = lang
        self._oem = oem
        self._psm = psm
        self._timeout = timeout

    def extract_text(self, image_buffer: bytes) -> str:
        """
        Run Tesseract OCR on an image buffer.

        Uses file-based I/O to let Tesseract handle any format natively.

        Args:
            image_buffer: Raw image bytes (any format Tesseract supports)

        Returns:
            Extracted text

        Raises:
            RuntimeError: If Tesseract fails
        """
        with TempFileManager.temp_directory(prefix="tesseract-") as tmp_dir:
            input_path = TempFileManager.write_file(tmp_dir, "input", image_buffer)
            output_base = os.path.join(tmp_dir, "output")

            args = [
                "tesseract",
                input_path,
                output_base,
                "-l",
                self._lang,
                "--oem",
                str(self._oem),
                "--psm",
                str(self._psm),
            ]

            result = subprocess.run(
                args,
                capture_output=True,
                timeout=self._timeout,
            )

            if result.returncode != 0:
                stderr = result.stderr.decode(errors="ignore")
                raise RuntimeError(f"Tesseract failed: {stderr}")

            output_path = output_base + ".txt"
            if os.path.exists(output_path):
                return TempFileManager.read_file(output_path).strip()

            return ""
