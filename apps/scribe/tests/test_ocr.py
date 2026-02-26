"""
Tests for OCR Service (Mistral-based)
"""

import pytest

from services.ocr.service import OCRService


class TestOCRService:
    """Test cases for OCR service."""

    def test_detect_mimetype_pdf(self):
        """Test PDF magic bytes detection."""
        pdf_data = b"%PDF-1.4\n..."
        assert OCRService._detect_mimetype(pdf_data) == "application/pdf"

    def test_detect_mimetype_png(self):
        """Test PNG magic bytes detection."""
        image_data = b"\x89PNG\r\n\x1a\n..."
        assert OCRService._detect_mimetype(image_data) == "image/png"

    def test_detect_mimetype_jpeg(self):
        """Test JPEG magic bytes detection."""
        image_data = b"\xff\xd8\xff..."
        assert OCRService._detect_mimetype(image_data) == "image/jpeg"

    def test_detect_mimetype_unknown(self):
        """Test unknown file type detection."""
        unknown_data = b"\x00\x00\x00..."
        assert OCRService._detect_mimetype(unknown_data) == "application/octet-stream"

    def test_to_data_url(self):
        """Test data URL generation."""
        data = b"hello"
        result = OCRService._to_data_url(data, "text/plain")
        assert result.startswith("data:text/plain;base64,")


class TestOCRServiceIntegration:
    """Integration tests for OCR service (requires Mistral API key)."""

    @pytest.mark.skip(reason="Requires Mistral API key")
    def test_recognize_simple_image(self):
        """Test OCR on a simple image."""
        from services.ocr import get_ocr_service

        # This would require an actual test image and API key
        pass
