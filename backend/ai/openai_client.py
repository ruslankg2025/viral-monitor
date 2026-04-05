"""
OpenAI API client.
Supports both gpt-4o and gpt-4o-mini with automatic model selection.
"""
from __future__ import annotations

import time
from typing import Any

import structlog

from backend.ai.schemas import AIResponse
from backend.ai.utils import parse_ai_json

logger = structlog.get_logger(__name__)

# Pricing per 1M tokens (USD)
PRICING = {
    "gpt-4o": {"in": 2.50, "out": 10.0},
    "gpt-4o-mini": {"in": 0.15, "out": 0.60},
}


class OpenAIClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self._api_key)
        return self._client

    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def complete(
        self,
        system: str,
        user: str,
        model: str = "gpt-4o-mini",
        max_tokens: int = 1000,
    ) -> AIResponse:
        if not self._api_key:
            raise RuntimeError("OpenAI API key не настроен")

        client = self._get_client()
        start = time.monotonic()

        response = await client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_text = response.choices[0].message.content or ""
        tokens_in = response.usage.prompt_tokens if response.usage else 0
        tokens_out = response.usage.completion_tokens if response.usage else 0

        prices = PRICING.get(model, PRICING["gpt-4o-mini"])
        cost = (tokens_in * prices["in"] + tokens_out * prices["out"]) / 1_000_000

        logger.info(
            "openai.complete",
            model=model,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=round(cost, 6),
            duration_ms=duration_ms,
        )

        return AIResponse(
            text=raw_text,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost,
            duration_ms=duration_ms,
            provider="openai",
            model=model,
        )

    async def complete_json(
        self,
        system: str,
        user: str,
        model: str = "gpt-4o-mini",
        max_tokens: int = 1000,
    ) -> tuple[dict | list, AIResponse]:
        result = await self.complete(system, user, model=model, max_tokens=max_tokens)
        parsed = parse_ai_json(result.text)
        return parsed, result
