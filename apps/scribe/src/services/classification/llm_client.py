import json
import time
from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from core.logging import get_logger
from core.metrics import record_llm_call, push_metrics

logger = get_logger(__name__)


@dataclass
class LLMConfig:
    api_key: str
    base_url: str
    model: str
    temperature: float = 0.3
    max_tokens: int = 1000


class LLMClient:
    def __init__(self, config: LLMConfig):
        self._client = OpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
        )
        self._model = config.model
        self._temperature = config.temperature
        self._max_tokens = config.max_tokens

        logger.info("LLM client initialized", model=self._model)

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        operation: str = "classification",
        user_id: str = "unknown",
    ) -> dict[str, Any]:
        start_time = time.time()
        input_tokens = 0
        output_tokens = 0

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=self._temperature,
                max_tokens=max_tokens or self._max_tokens,
                response_format={"type": "json_object"},
            )

            duration = time.time() - start_time

            if response.usage:
                input_tokens = response.usage.prompt_tokens or 0
                output_tokens = response.usage.completion_tokens or 0

            record_llm_call(
                model=self._model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_seconds=duration,
                status="success",
            )
            push_metrics()

            result_text = response.choices[0].message.content
            if not result_text:
                raise ValueError("Empty response from LLM")

            return json.loads(result_text)

        except Exception as e:
            duration = time.time() - start_time
            error_type = type(e).__name__

            record_llm_call(
                model=self._model,
                operation=operation,
                user_id=user_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_seconds=duration,
                status="error",
                error_type=error_type,
            )
            push_metrics()

            logger.error(
                "LLM API call failed",
                model=self._model,
                operation=operation,
                user_id=user_id,
                error=str(e),
                duration=duration,
            )
            raise
