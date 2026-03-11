from __future__ import annotations

import re


class QueryRewriteAgent:
    def rewrite(
        self,
        *,
        query: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> str:
        cleaned = re.sub(r"\s+", " ", query).strip()
        if not cleaned:
            return ""

        if not conversation_history:
            return cleaned

        # Deterministic: only prepend the latest user message when query is short.
        if len(cleaned) < 16:
            for message in reversed(conversation_history[-4:]):
                if message.get("role") == "user" and isinstance(message.get("content"), str):
                    previous = re.sub(r"\s+", " ", message["content"]).strip()
                    if previous and previous != cleaned:
                        return f"{previous} {cleaned}".strip()
        return cleaned
