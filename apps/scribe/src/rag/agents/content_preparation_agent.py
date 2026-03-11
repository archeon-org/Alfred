from __future__ import annotations

import re

from core.logging import get_logger
from rag.types import PreparedContent

logger = get_logger(__name__)


class ContentPreparationAgent:
    def prepare(
        self,
        *,
        content: str,
        title: str | None,
        original_name: str | None,
    ) -> PreparedContent:
        cleaned = re.sub(r"\s+", " ", content).strip()
        if not cleaned:
            raise ValueError("Document content is empty after normalization")

        prepared = PreparedContent(
            text=cleaned,
            title=(title or "").strip() or "Untitled document",
            original_name=(original_name or "").strip() or "Untitled document",
        )

        logger.info(
            "Prepared content for indexing",
            chars=len(prepared.text),
            title=prepared.title,
        )
        return prepared
