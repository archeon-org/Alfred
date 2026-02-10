"""
OCR Service Package

Refactored for SOLID/SOC/KISS:
- TempFileManager: Handles temp file I/O
- PDFHandler: PDF detection, embedded text extraction, page conversion
- ImageHandler: Single image OCR via Tesseract
- OCRService: Orchestrates handlers (facade)
"""

from services.ocr.service import OCRService, get_ocr_service

__all__ = ["OCRService", "get_ocr_service"]
