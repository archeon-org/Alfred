"""
Classification Service

Facade that orchestrates prompt building, LLM calls, and result parsing.
KISS: Simple public API, complexity hidden in components.
"""

from dataclasses import dataclass

from core.config import get_settings
from core.logging import get_logger
from domain.models import ClassificationResult
from services.classification.llm_client import LLMClient, LLMConfig
from services.classification.prompt_builder import PromptBuilder
from services.classification.result_parser import ResultParser
from services.classification.schemas import ClassificationConstants

logger = get_logger(__name__)


@dataclass
class TitleGenerationResult:
    """Result of title generation."""

    title: str


class ClassificationService:
    """
    Service for AI-powered document classification and title generation.

    This is a facade that orchestrates:
    - PromptBuilder: Constructs prompts
    - LLMClient: API communication
    - ResultParser: Response parsing

    KISS: Simple public API (classify_document, generate_title).
    """

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

        logger.info("Classification service initialized")

    def classify_document(
        self,
        content: str,
        categories: list[dict[str, str]],
        tags: list[dict[str, str]],
        original_filename: str | None = None,
    ) -> ClassificationResult:
        """
        Classify a document using AI.

        Args:
            content: Document text content
            categories: User's existing categories [{"id": "...", "name": "..."}]
            tags: User's existing tags [{"id": "...", "name": "..."}]
            original_filename: Original file name for context

        Returns:
            ClassificationResult with category, tags, and title
        """
        logger.info("Starting document classification")

        # Truncate content
        truncated_content = PromptBuilder.truncate_content(content)

        # Build prompt
        prompt = self._prompt_builder.build_classification_prompt(
            truncated_content, categories, tags, original_filename
        )

        try:
            # Call LLM
            result = self._llm_client.complete_json(
                system_prompt=PromptBuilder.CLASSIFICATION_SYSTEM_PROMPT,
                user_prompt=prompt,
            )

            logger.debug("Classification result", result=result)

            # Parse result
            return self._result_parser.parse_classification(result)

        except Exception as e:
            logger.error("Classification failed", error=str(e))
            raise

    def generate_title(
        self,
        content: str,
        original_filename: str | None = None,
    ) -> TitleGenerationResult:
        """
        Generate a title for a document using AI.

        Args:
            content: Document text content
            original_filename: Original file name for context

        Returns:
            TitleGenerationResult with generated title
        """
        logger.info("Starting title generation")

        # Truncate content
        truncated_content = PromptBuilder.truncate_content(
            content,
            ClassificationConstants.MAX_TITLE_CONTENT_CHARS,
        )

        # Build prompt
        prompt = self._prompt_builder.build_title_prompt(truncated_content, original_filename)

        try:
            # Call LLM
            result = self._llm_client.complete_json(
                system_prompt=PromptBuilder.TITLE_SYSTEM_PROMPT,
                user_prompt=prompt,
                max_tokens=100,
            )

            # Parse result
            title = self._result_parser.parse_title(result)

            logger.info("Generated title", title=title)
            return TitleGenerationResult(title=title)

        except Exception as e:
            logger.error("Title generation failed", error=str(e))
            raise


# Singleton instance
_classification_service: ClassificationService | None = None


def get_classification_service() -> ClassificationService:
    """Get or create classification service singleton."""
    global _classification_service
    if _classification_service is None:
        _classification_service = ClassificationService()
    return _classification_service
