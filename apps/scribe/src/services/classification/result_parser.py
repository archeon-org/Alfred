from typing import Any

from domain.models import ClassificationResult, NewCategory
from services.classification.schemas import ClassificationConstants


class ResultParser:
    def parse_classification(self, result: dict[str, Any]) -> ClassificationResult:
        new_category = self._parse_new_category(result.get("newCategory"))

        return ClassificationResult(
            category_id=result.get("categoryId"),
            new_category=new_category,
            tag_ids=result.get("tagIds", []),
            title=self._safe_title(result.get("title")),
        )

    def parse_title(self, result: dict[str, Any]) -> str:
        return self._safe_title(result.get("title"))

    def _parse_new_category(self, data: dict[str, Any] | None) -> NewCategory | None:
        if not data:
            return None

        return NewCategory(
            name=self._safe_category_name(data.get("name")),
            icon=data.get("icon", ClassificationConstants.DEFAULT_ICON),
            color=self._safe_color(data.get("color")),
        )

    def _safe_title(self, title: str | None) -> str:
        if not title:
            return ClassificationConstants.DEFAULT_TITLE
        return title[: ClassificationConstants.MAX_TITLE_LENGTH]

    def _safe_category_name(self, name: str | None) -> str:
        if not name:
            return "New Category"
        return name[: ClassificationConstants.MAX_CATEGORY_NAME_LENGTH]

    def _safe_color(self, color: str | None) -> str:
        if not color:
            return ClassificationConstants.DEFAULT_COLOR

        if len(color) == 7 and color.startswith("#"):
            return color

        return ClassificationConstants.DEFAULT_COLOR
