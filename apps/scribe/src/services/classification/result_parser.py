"""
Result Parser

Single Responsibility: Parse LLM JSON responses into domain models.
KISS: Simple parsing with safe defaults.
"""

from typing import Any

from domain.models import ClassificationResult, NewCategory
from services.classification.schemas import ClassificationConstants


class ResultParser:
    """
    Parses LLM responses into domain models.

    Single Responsibility: Only handles response parsing.
    Provides safe defaults for missing/invalid fields.
    """

    def parse_classification(self, result: dict[str, Any]) -> ClassificationResult:
        """
        Parse classification response into ClassificationResult.

        Args:
            result: Parsed JSON from LLM response

        Returns:
            ClassificationResult domain model
        """
        new_category = self._parse_new_category(result.get("newCategory"))

        return ClassificationResult(
            category_id=result.get("categoryId"),
            new_category=new_category,
            tag_ids=result.get("tagIds", []),
            title=self._safe_title(result.get("title")),
        )

    def parse_title(self, result: dict[str, Any]) -> str:
        """
        Parse title generation response.

        Args:
            result: Parsed JSON from LLM response

        Returns:
            Title string
        """
        return self._safe_title(result.get("title"))

    def _parse_new_category(self, data: dict[str, Any] | None) -> NewCategory | None:
        """Parse new category suggestion."""
        if not data:
            return None

        return NewCategory(
            name=self._safe_category_name(data.get("name")),
            icon=data.get("icon", ClassificationConstants.DEFAULT_ICON),
            color=self._safe_color(data.get("color")),
        )

    def _safe_title(self, title: str | None) -> str:
        """Ensure title is valid and within length limit."""
        if not title:
            return ClassificationConstants.DEFAULT_TITLE
        return title[: ClassificationConstants.MAX_TITLE_LENGTH]

    def _safe_category_name(self, name: str | None) -> str:
        """Ensure category name is valid and within length limit."""
        if not name:
            return "New Category"
        return name[: ClassificationConstants.MAX_CATEGORY_NAME_LENGTH]

    def _safe_color(self, color: str | None) -> str:
        """Ensure color is a valid hex code."""
        if not color:
            return ClassificationConstants.DEFAULT_COLOR

        # Basic validation: must be #XXXXXX format
        if len(color) == 7 and color.startswith("#"):
            return color

        return ClassificationConstants.DEFAULT_COLOR
