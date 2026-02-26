from services.classification.schemas import ClassificationConstants


class PromptBuilder:
    CLASSIFICATION_SYSTEM_PROMPT = (
        "You are a document classification assistant. Respond only with valid JSON."
    )
    TITLE_SYSTEM_PROMPT = "You are a document title generator. Respond only with valid JSON."

    def build_classification_prompt(
        self,
        content: str,
        categories: list[dict[str, str]],
        tags: list[dict[str, str]],
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
1. Choose an existing category if possible (preferred)
2. Only suggest a new category if nothing fits
3. Select all relevant tags
4. Generate a concise title (max 60 chars)

Respond with JSON:
{{
  "categoryId": "uuid-or-null",
  "newCategory": null or {{"name": "...", "icon": "...-outline", "color": "#..."}},
  "tagIds": ["uuid1", "uuid2"],
  "title": "Document Title",
  "confidence": "high|medium|low",
  "reasoning": "Brief explanation"
}}

Available icons: {icons_preview}...
Available colors: {colors_preview}..."""

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

    def _format_categories(self, categories: list[dict[str, str]]) -> str:
        if not categories:
            return "(No categories defined yet)"
        return "\n".join(f"  - {c['id']}: {c['name']}" for c in categories)

    def _format_tags(self, tags: list[dict[str, str]]) -> str:
        if not tags:
            return "(No tags defined yet)"
        return "\n".join(f"  - {t['id']}: {t['name']}" for t in tags)
