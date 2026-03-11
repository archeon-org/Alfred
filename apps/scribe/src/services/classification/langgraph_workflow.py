from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Literal, TypedDict, cast

from pydantic import BaseModel, Field

from core.logging import get_logger
from domain.models import ClassificationResult
from services.classification.prompt_builder import PromptBuilder
from services.classification.result_parser import ResultParser
from services.classification.schemas import ClassificationConstants

logger = get_logger(__name__)


class LLMNewCategory(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=ClassificationConstants.MAX_CATEGORY_NAME_LENGTH,
    )
    icon: str = Field(default=ClassificationConstants.DEFAULT_ICON)
    color: str = Field(default=ClassificationConstants.DEFAULT_COLOR)
    parentCategoryId: str | None = None


class LLMClassificationDecision(BaseModel):
    categoryId: str | None = None
    newCategory: LLMNewCategory | None = None
    tagIds: list[str] = Field(default_factory=list)
    title: str = Field(
        default=ClassificationConstants.DEFAULT_TITLE,
        max_length=ClassificationConstants.MAX_TITLE_LENGTH,
    )
    confidence: Literal["high", "medium", "low"] = "medium"
    reasoning: str = Field(default="", max_length=ClassificationConstants.MAX_REASONING_LENGTH)


class ClassificationGraphState(TypedDict, total=False):
    content: str
    original_filename: str | None
    categories: list[dict[str, Any]]
    tags: list[dict[str, Any]]
    attempt: int
    max_attempts: int
    decision: dict[str, Any]
    validation_errors: list[str]
    should_retry: bool
    result: ClassificationResult


@dataclass(frozen=True)
class LangGraphWorkflowConfig:
    api_key: str
    base_url: str
    model: str
    temperature: float = 0.2
    max_tokens: int = 1000


class LangGraphClassificationWorkflow:
    def __init__(self, config: LangGraphWorkflowConfig):
        try:
            from langchain_openai import ChatOpenAI  # type: ignore[import-not-found]
            from langgraph.graph import StateGraph  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError(
                "LangGraph/LangChain dependencies are not installed. "
                "Install langgraph, langchain, and langchain-openai."
            ) from exc

        self._prompt_builder = PromptBuilder()
        self._result_parser = ResultParser()
        self._chat_model = ChatOpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
            model=config.model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            max_retries=0,
        ).with_structured_output(LLMClassificationDecision, method="json_schema")

        graph = StateGraph(ClassificationGraphState)
        graph.add_node("classify", self._classify_node)
        graph.add_node("validate", self._validate_node)
        graph.add_node("finalize", self._finalize_node)
        graph.set_entry_point("classify")
        graph.add_edge("classify", "validate")
        graph.add_conditional_edges(
            "validate",
            self._validate_router,
            {"retry": "classify", "finalize": "finalize"},
        )
        graph.set_finish_point("finalize")
        self._graph = graph.compile()

    def classify_document(
        self,
        content: str,
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
        original_filename: str | None = None,
    ) -> ClassificationResult:
        truncated_content = PromptBuilder.truncate_content(content)

        final_state = self._graph.invoke(
            {
                "content": truncated_content,
                "original_filename": original_filename,
                "categories": categories,
                "tags": tags,
                "attempt": 0,
                "max_attempts": ClassificationConstants.MAX_CLASSIFICATION_ATTEMPTS,
            }
        )

        result = final_state.get("result")
        if isinstance(result, ClassificationResult):
            return result

        # Safety fallback: always produce a valid ClassificationResult.
        decision = cast(dict[str, Any], final_state.get("decision", {}))
        return self._result_parser.parse_classification(decision)

    def _classify_node(self, state: ClassificationGraphState) -> ClassificationGraphState:
        attempt = int(state.get("attempt", 0)) + 1
        prompt = self._prompt_builder.build_classification_prompt(
            state["content"],
            state["categories"],
            state["tags"],
            state.get("original_filename"),
        )

        decision = self._invoke_model_with_retry(prompt)
        logger.debug("LangGraph classification decision", attempt=attempt, decision=decision)
        return {"attempt": attempt, "decision": decision.model_dump()}

    def _validate_node(self, state: ClassificationGraphState) -> ClassificationGraphState:
        raw_decision = state.get("decision", {})
        categories = state["categories"]
        tags = state["tags"]
        attempt = int(state.get("attempt", 1))
        max_attempts = int(state.get("max_attempts", 1))

        sanitized, errors, unresolved = self._sanitize_decision(raw_decision, categories, tags)

        should_retry = (bool(errors) or unresolved) and attempt < max_attempts
        if not should_retry and unresolved:
            fallback_category_id = self._find_fallback_category(categories)
            if fallback_category_id:
                sanitized["categoryId"] = fallback_category_id
                errors.append("No valid category resolved; fallback category selected.")

        logger.debug(
            "LangGraph classification validation",
            attempt=attempt,
            should_retry=should_retry,
            validation_errors=errors,
        )
        return {
            "decision": sanitized,
            "validation_errors": errors,
            "should_retry": should_retry,
        }

    def _validate_router(self, state: ClassificationGraphState) -> Literal["retry", "finalize"]:
        return "retry" if state.get("should_retry") else "finalize"

    def _finalize_node(self, state: ClassificationGraphState) -> ClassificationGraphState:
        decision = state.get("decision", {})
        result = self._result_parser.parse_classification(decision)
        return {"result": result}

    def _invoke_model_with_retry(self, prompt: str) -> LLMClassificationDecision:
        last_error: Exception | None = None

        for network_attempt in range(ClassificationConstants.MAX_NETWORK_RETRIES):
            try:
                response = self._chat_model.invoke(
                    [
                        ("system", PromptBuilder.CLASSIFICATION_SYSTEM_PROMPT),
                        ("user", prompt),
                    ]
                )
                if isinstance(response, LLMClassificationDecision):
                    return response
                if isinstance(response, dict):
                    return LLMClassificationDecision(**response)
                raise ValueError("Unexpected structured response type from classification model")
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if network_attempt == ClassificationConstants.MAX_NETWORK_RETRIES - 1:
                    break
                if not self._is_retryable_error(exc):
                    break

                sleep_seconds = ClassificationConstants.NETWORK_RETRY_BASE_SECONDS * (
                    2**network_attempt
                )
                logger.warning(
                    "Transient model error during classification; retrying",
                    attempt=network_attempt + 1,
                    sleep_seconds=sleep_seconds,
                    error=str(exc),
                )
                time.sleep(sleep_seconds)

        if last_error is None:
            raise RuntimeError("Classification model invocation failed without an explicit error")
        raise last_error

    @staticmethod
    def _is_retryable_error(error: Exception) -> bool:
        retryable_tokens = {
            "ratelimit",
            "rate_limit",
            "timeout",
            "connection",
            "temporarily unavailable",
            "service unavailable",
            "too many requests",
        }
        error_name = error.__class__.__name__.lower()
        error_text = str(error).lower()
        return any(token in error_name or token in error_text for token in retryable_tokens)

    def _sanitize_decision(
        self,
        decision: dict[str, Any],
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], list[str], bool]:
        errors: list[str] = []
        category_by_id = {
            str(category["id"]): category
            for category in categories
            if category.get("id") is not None
        }
        valid_tag_ids = {str(tag["id"]) for tag in tags if tag.get("id") is not None}

        sanitized: dict[str, Any] = {
            "categoryId": None,
            "newCategory": None,
            "tagIds": [],
            "title": decision.get("title"),
            "confidence": decision.get("confidence"),
            "reasoning": decision.get("reasoning"),
        }

        raw_category_id = decision.get("categoryId")
        if raw_category_id and str(raw_category_id) in category_by_id:
            sanitized["categoryId"] = str(raw_category_id)
        elif raw_category_id:
            errors.append(f"Unknown categoryId returned by model: {raw_category_id}")

        raw_tag_ids = decision.get("tagIds", [])
        if isinstance(raw_tag_ids, list):
            sanitized["tagIds"] = [
                str(tag_id) for tag_id in raw_tag_ids if str(tag_id) in valid_tag_ids
            ]

        raw_new_category = decision.get("newCategory")
        if raw_new_category and sanitized["categoryId"]:
            errors.append("Both categoryId and newCategory were returned; ignoring newCategory.")
        elif isinstance(raw_new_category, dict):
            sanitized["newCategory"] = self._sanitize_new_category(raw_new_category, category_by_id)
            parent_id = sanitized["newCategory"].get("parentCategoryId")
            if parent_id and parent_id not in category_by_id:
                errors.append(f"Unknown parentCategoryId returned by model: {parent_id}")
                sanitized["newCategory"]["parentCategoryId"] = None
            elif parent_id and int(category_by_id[parent_id].get("level", 1)) > 1:
                parent_parent_id = category_by_id[parent_id].get("parentId")
                if parent_parent_id and str(parent_parent_id) in category_by_id:
                    sanitized["newCategory"]["parentCategoryId"] = str(parent_parent_id)
                else:
                    sanitized["newCategory"]["parentCategoryId"] = None
                errors.append(
                    "newCategory parentCategoryId pointed to a child folder; adjusted to root-level parent."
                )

        unresolved = not sanitized["categoryId"] and not sanitized["newCategory"]
        return sanitized, errors, unresolved

    def _sanitize_new_category(
        self,
        raw_new_category: dict[str, Any],
        category_by_id: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        parent_id = raw_new_category.get("parentCategoryId")
        if parent_id is not None:
            parent_id = str(parent_id)
            if parent_id not in category_by_id:
                parent_id = None

        return {
            "name": self._sanitize_name(raw_new_category.get("name")),
            "icon": self._sanitize_icon(raw_new_category.get("icon")),
            "color": self._sanitize_color(raw_new_category.get("color")),
            "parentCategoryId": parent_id,
        }

    @staticmethod
    def _sanitize_name(name: Any) -> str:
        if not isinstance(name, str) or not name.strip():
            return "New Category"
        return name.strip()[: ClassificationConstants.MAX_CATEGORY_NAME_LENGTH]

    @staticmethod
    def _sanitize_icon(icon: Any) -> str:
        if isinstance(icon, str) and icon in ClassificationConstants.AVAILABLE_ICONS:
            return icon
        return ClassificationConstants.DEFAULT_ICON

    @staticmethod
    def _sanitize_color(color: Any) -> str:
        if isinstance(color, str) and len(color) == 7 and color.startswith("#"):
            return color
        return ClassificationConstants.DEFAULT_COLOR

    @staticmethod
    def _find_fallback_category(categories: list[dict[str, Any]]) -> str | None:
        if not categories:
            return None

        for category in categories:
            name = str(category.get("name", "")).lower()
            if "inbox" in name or "to classify" in name:
                category_id = category.get("id")
                return str(category_id) if category_id else None

        root_categories = [category for category in categories if not category.get("parentId")]
        fallback = root_categories[0] if root_categories else categories[0]
        fallback_id = fallback.get("id")
        return str(fallback_id) if fallback_id else None
