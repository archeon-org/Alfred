"""
Domain Layer

Contains value objects, DTOs, and domain logic.
Pure Python - no external dependencies except dataclasses.
"""

from domain.models import (
    DocumentContext,
    ProcessingResult,
    ClassificationResult,
    NewCategory,
    ProcessingStatus,
)

__all__ = [
    "DocumentContext",
    "ProcessingResult",
    "ClassificationResult",
    "NewCategory",
    "ProcessingStatus",
]
