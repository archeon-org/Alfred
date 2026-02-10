"""
Classification Service Package

Refactored for SOLID/SOC/KISS:
- PromptBuilder: Constructs prompts for classification/title generation
- ResultParser: Parses AI responses into domain models
- LLMClient: Wrapper for LLM API calls
- ClassificationService: Orchestrates the above (facade)
"""

from services.classification.service import (
    ClassificationService,
    get_classification_service,
)

__all__ = ["ClassificationService", "get_classification_service"]
