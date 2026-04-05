"""
Anthropic Claude API client.
Model: claude-sonnet-4-20250514 (latest as of knowledge cutoff).
"""
from __future__ import annotations

import time
from typing import Any

import structlog

from backend.ai.schemas import AIResponse
from backend.ai.utils import parse_ai_json, strip_markdown_fences

logger = structlog.get_logger(__name__)

# Pricing per 1M tokens (USD)
CLAUDE_SONNET_PRICE_IN = 3.0
CLAUDE_SONNET_PRICE_OUT = 15.0


class ClaudeClient:
    MODEL = "claude-sonnet-4-20250514"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is None:
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
        return self._client

    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def complete(
        self,
        system: str,
        user: str,
        max_tokens: int = 2000,
    ) -> AIResponse:
        if not self._api_key:
            raise RuntimeError("Claude API key не настроен")

        client = self._get_client()
        start = time.monotonic()

        response = await client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_text = response.content[0].text
        tokens_in = response.usage.input_tokens
        tokens_out = response.usage.output_tokens
        cost = (tokens_in * CLAUDE_SONNET_PRICE_IN + tokens_out * CLAUDE_SONNET_PRICE_OUT) / 1_000_000

        logger.info(
            "claude.complete",
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
            provider="claude",
            model=self.MODEL,
        )

    async def complete_json(
        self,
        system: str,
        user: str,
        max_tokens: int = 2000,
    ) -> tuple[dict | list, AIResponse]:
        """Complete and parse JSON response."""
        result = await self.complete(system, user, max_tokens)
        parsed = parse_ai_json(result.text)
        return parsed, result
