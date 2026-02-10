"""
Temp File Manager

Single Responsibility: Manage temporary file/directory lifecycle.
KISS: Simple context manager pattern.
"""

import os
import tempfile
from contextlib import contextmanager
from typing import Generator

from core.logging import get_logger

logger = get_logger(__name__)


class TempFileManager:
    """
    Handles temporary file and directory operations.

    Single Responsibility: Only manages temp file lifecycle.
    Uses context managers for automatic cleanup.
    """

    @staticmethod
    @contextmanager
    def temp_directory(prefix: str = "ocr-") -> Generator[str, None, None]:
        """
        Create a temporary directory with automatic cleanup.

        Usage:
            with TempFileManager.temp_directory() as tmp_dir:
                # Use tmp_dir
            # Automatically cleaned up
        """
        tmp_dir = tempfile.mkdtemp(prefix=prefix)
        try:
            yield tmp_dir
        finally:
            TempFileManager.cleanup_directory(tmp_dir)

    @staticmethod
    def write_file(directory: str, filename: str, data: bytes) -> str:
        """Write bytes to a file in the specified directory. Returns full path."""
        path = os.path.join(directory, filename)
        with open(path, "wb") as f:
            f.write(data)
        return path

    @staticmethod
    def read_file(path: str) -> str:
        """Read text content from a file."""
        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    @staticmethod
    def read_binary(path: str) -> bytes:
        """Read binary content from a file."""
        with open(path, "rb") as f:
            return f.read()

    @staticmethod
    def list_files(directory: str, prefix: str = "", suffix: str = "") -> list[str]:
        """List files in directory matching prefix and suffix."""
        try:
            return sorted(
                [f for f in os.listdir(directory) if f.startswith(prefix) and f.endswith(suffix)]
            )
        except OSError:
            return []

    @staticmethod
    def cleanup_files(directory: str, prefix: str = "", suffix: str = "") -> None:
        """Remove files matching prefix/suffix in a directory."""
        for filename in TempFileManager.list_files(directory, prefix, suffix):
            try:
                os.unlink(os.path.join(directory, filename))
            except OSError:
                pass

    @staticmethod
    def cleanup_directory(directory: str) -> None:
        """Safely cleanup a temporary directory and all contents."""
        try:
            for filename in os.listdir(directory):
                try:
                    os.unlink(os.path.join(directory, filename))
                except OSError:
                    pass
            os.rmdir(directory)
        except OSError:
            logger.warning("Failed to cleanup temp dir", path=directory)
