from typing import Any

from services.classification.schemas import ClassificationConstants


class PromptBuilder:
    CLASSIFICATION_SYSTEM_PROMPT = (
        "You are a document classification assistant. Respond only with valid JSON."
    )
    TITLE_SYSTEM_PROMPT = "You are a document title generator. Respond only with valid JSON."

    def build_classification_prompt(
        self,
        content: str,
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
        original_filename: str | None = None,
    ) -> str:
        categories_str = self._format_categories(categories)
        tags_str = self._format_tags(tags)
        icons_preview = ", ".join(ClassificationConstants.AVAILABLE_ICONS[:10])
        colors_preview = ", ".join(ClassificationConstants.AVAILABLE_COLORS[:6])

        filename_line = f'Original filename: "{original_filename}"' if original_filename else ""

        return f"""Classify this document into the user's folder structure.

{filename_line}

USER'S EXISTING CATEGORIES:
{categories_str}

USER'S EXISTING TAGS:
{tags_str}

DOCUMENT CONTENT:
{content}

---

INSTRUCTIONS:
1. Prefer an existing category. Use the most specific folder (leaf level) when possible.
2. Category hierarchy has max 2 levels. Child folders are more specific than root folders.
3. Only suggest a new category if nothing fits. If possible, attach it to an existing root via parentCategoryId.
4. Select only relevant tags from the provided IDs.
5. Generate a concise title (max 60 chars).

Respond with JSON:
{{
  "categoryId": "uuid-or-null",
  "newCategory": null or {{"name": "...", "icon": "...-outline", "color": "#...", "parentCategoryId": "uuid-or-null"}},
  "tagIds": ["uuid1", "uuid2"],
  "title": "Document Title",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation"
}}

Available icons: {icons_preview}...
Available colors: {colors_preview}..."""  # noqa: S608

    def build_title_prompt(
        self,
        content: str,
        original_filename: str | None = None,
    ) -> str:
        filename_line = f'Original filename: "{original_filename}"' if original_filename else ""

        return f"""Generate a concise, descriptive title for this document (max 60 characters).
The title should describe what the document is about in a human-readable way.

{filename_line}

Document content:
{content}

Respond with JSON: {{"title": "Your Title Here"}}"""

    @staticmethod
    def truncate_content(content: str, max_chars: int | None = None) -> str:
        if max_chars is None:
            max_chars = ClassificationConstants.MAX_CONTENT_CHARS

        if len(content) <= max_chars:
            return content

        half = max_chars // 2
        return content[:half] + "\n...[truncated]...\n" + content[-half:]

    def _format_categories(self, categories: list[dict[str, Any]]) -> str:
        if not categories:
            return "(No categories defined yet)"
        lines: list[str] = []
        for category in categories:
            category_id = category.get("id")
            name = category.get("name")
            path = category.get("path") or name
            level = category.get("level") or 1
            is_leaf = bool(category.get("isLeaf", True))
            parent_id = category.get("parentId")
            lines.append(
                f"  - id={category_id} | level={level} | leaf={is_leaf} | "
                f"path={path} | parentId={parent_id} | name={name}"
            )
        return "\n".join(lines)

    def _format_tags(self, tags: list[dict[str, Any]]) -> str:
        if not tags:
            return "(No tags defined yet)"
        return "\n".join(f"  - {t['id']}: {t['name']}" for t in tags)
