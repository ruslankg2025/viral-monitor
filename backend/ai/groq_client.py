"""
Groq API client — FREE tier, OpenAI-compatible API.
Model: llama-3.3-70b-versatile (30 req/min free).
"""
from __future__ import annotations

import time

import httpx
import structlog

from backend.ai.schemas import AIResponse
from backend.ai.utils import parse_ai_json

logger = structlog.get_logger(__name__)

GROQ_API_BASE = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


class GroqClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def complete(
        self,
        system: str,
        user: str,
        max_tokens: int = 500,
    ) -> AIResponse:
        if not self._api_key:
            raise RuntimeError("Groq API key не настроен")

        start = time.monotonic()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                GROQ_API_BASE,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        tokens_in = usage.get("prompt_tokens", 0)
        tokens_out = usage.get("completion_tokens", 0)

        logger.info(
            "groq.complete",
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            duration_ms=duration_ms,
        )

        return AIResponse(
            text=raw_text,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=0.0,  # Free tier
            duration_ms=duration_ms,
            provider="groq",
            model=GROQ_MODEL,
        )

    async def complete_json(
        self,
        system: str,
        user: str,
        max_tokens: int = 500,
    ) -> tuple[dict | list, AIResponse]:
        result = await self.complete(system, user, max_tokens=max_tokens)
        parsed = parse_ai_json(result.text)
        return parsed, result
