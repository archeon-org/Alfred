import time
from dataclasses import dataclass
from typing import Any

from core.config import get_settings
from core.logging import get_logger
from domain.models import ClassificationResult
from services.classification.langgraph_workflow import (
    LangGraphClassificationWorkflow,
    LangGraphWorkflowConfig,
)
from services.classification.llm_client import LLMClient, LLMConfig
from services.classification.prompt_builder import PromptBuilder
from services.classification.result_parser import ResultParser
from services.classification.schemas import ClassificationConstants

logger = get_logger(__name__)


@dataclass
class TitleGenerationResult:
    title: str


class ClassificationService:
    def __init__(self) -> None:
        settings = get_settings()
        ai_settings = settings.ai

        self._llm_client = LLMClient(
            LLMConfig(
                api_key=ai_settings.fireworks_api_key.get_secret_value(),
                base_url=ai_settings.fireworks_base_url,
                model=ai_settings.classification_model,
            )
        )

        self._prompt_builder = PromptBuilder()
        self._result_parser = ResultParser()
        self._workflow: LangGraphClassificationWorkflow | None = None

        try:
            self._workflow = LangGraphClassificationWorkflow(
                LangGraphWorkflowConfig(
                    api_key=ai_settings.fireworks_api_key.get_secret_value(),
                    base_url=ai_settings.fireworks_base_url,
                    model=ai_settings.classification_model,
                )
            )
            logger.info("LangGraph classification workflow enabled")
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "LangGraph workflow unavailable, using legacy classification fallback",
                error=str(e),
            )

        logger.info("Classification service initialized")

    def classify_document(
        self,
        content: str,
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
        original_filename: str | None = None,
    ) -> ClassificationResult:
        logger.info("Starting document classification")

        try:
            if self._workflow:
                return self._workflow.classify_document(
                    content,
                    categories,
                    tags,
                    original_filename,
                )

            return self._legacy_classify_document(content, categories, tags, original_filename)

        except Exception as e:
            logger.warning(
                "LangGraph classification failed, switching to legacy fallback", error=str(e)
            )
            return self._legacy_classify_document(content, categories, tags, original_filename)

    def generate_title(
        self,
        content: str,
        original_filename: str | None = None,
    ) -> TitleGenerationResult:
        logger.info("Starting title generation")

        truncated_content = PromptBuilder.truncate_content(
            content,
            ClassificationConstants.MAX_TITLE_CONTENT_CHARS,
        )

        prompt = self._prompt_builder.build_title_prompt(truncated_content, original_filename)

        try:
            last_error: Exception | None = None
            for attempt in range(ClassificationConstants.MAX_NETWORK_RETRIES):
                try:
                    result = self._llm_client.complete_json(
                        system_prompt=PromptBuilder.TITLE_SYSTEM_PROMPT,
                        user_prompt=prompt,
                        max_tokens=100,
                    )

                    title = self._result_parser.parse_title(result)

                    logger.info("Generated title", title=title)
                    return TitleGenerationResult(title=title)
                except Exception as e:  # noqa: BLE001
                    last_error = e
                    if attempt == ClassificationConstants.MAX_NETWORK_RETRIES - 1:
                        break
                    if not self._is_retryable_error(e):
                        break
                    sleep_seconds = ClassificationConstants.NETWORK_RETRY_BASE_SECONDS * (
                        2**attempt
                    )
                    logger.warning(
                        "Transient title-generation error, retrying",
                        attempt=attempt + 1,
                        sleep_seconds=sleep_seconds,
                        error=str(e),
                    )
                    time.sleep(sleep_seconds)

            if last_error:
                raise last_error
            raise RuntimeError("Title generation failed without explicit exception")

        except Exception as e:
            logger.error("Title generation failed", error=str(e))
            raise

    def _legacy_classify_document(
        self,
        content: str,
        categories: list[dict[str, Any]],
        tags: list[dict[str, Any]],
        original_filename: str | None = None,
    ) -> ClassificationResult:
        truncated_content = PromptBuilder.truncate_content(content)

        prompt = self._prompt_builder.build_classification_prompt(
            truncated_content, categories, tags, original_filename
        )

        last_error: Exception | None = None

        for attempt in range(ClassificationConstants.MAX_NETWORK_RETRIES):
            try:
                result = self._llm_client.complete_json(
                    system_prompt=PromptBuilder.CLASSIFICATION_SYSTEM_PROMPT,
                    user_prompt=prompt,
                )
                logger.debug("Legacy classification result", result=result)
                return self._result_parser.parse_classification(result)
            except Exception as e:  # noqa: BLE001
                last_error = e
                if attempt == ClassificationConstants.MAX_NETWORK_RETRIES - 1:
                    break
                if not self._is_retryable_error(e):
                    break
                sleep_seconds = ClassificationConstants.NETWORK_RETRY_BASE_SECONDS * (2**attempt)
                logger.warning(
                    "Transient classification error, retrying legacy path",
                    attempt=attempt + 1,
                    sleep_seconds=sleep_seconds,
                    error=str(e),
                )
                time.sleep(sleep_seconds)

        if last_error:
            raise last_error
        raise RuntimeError("Legacy classification failed without explicit exception")

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


_classification_service: ClassificationService | None = None


def get_classification_service() -> ClassificationService:
    global _classification_service
    if _classification_service is None:
        _classification_service = ClassificationService()
    return _classification_service
