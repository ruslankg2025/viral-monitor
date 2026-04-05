"""
AIRouter — central hub for all AI calls.
- Routes tasks to optimal provider based on DB settings
- Automatic fallback chain on provider failure
- Logs every call to api_usage_log
- Cost-aware: uses cheap/free models for routine tasks
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from backend.ai.claude_client import ClaudeClient
from backend.ai.groq_client import GroqClient
from backend.ai.openai_client import OpenAIClient
from backend.ai.prompts import PROMPTS
from backend.ai.schemas import AIResponse, CategorizationResult
from backend.ai.utils import parse_ai_json
from backend.database import db_session, get_all_settings_dict
from backend.models import APIUsageLog
from backend.schemas import VideoAnalysisInput, GenerateScriptRequest

logger = structlog.get_logger(__name__)


class AIRouter:
    """
    Reads provider settings from DB on each call (settings can change at runtime).
    Clients are lazily created and cached per key.
    """

    def __init__(self) -> None:
        self._claude: dict[str, ClaudeClient] = {}
        self._openai: dict[str, OpenAIClient] = {}
        self._groq: dict[str, GroqClient] = {}

    def _claude_client(self, key: str) -> ClaudeClient:
        if key not in self._claude:
            self._claude[key] = ClaudeClient(key)
        return self._claude[key]

    def _openai_client(self, key: str) -> OpenAIClient:
        if key not in self._openai:
            self._openai[key] = OpenAIClient(key)
        return self._openai[key]

    def _groq_client(self, key: str) -> GroqClient:
        if key not in self._groq:
            self._groq[key] = GroqClient(key)
        return self._groq[key]

    async def _log_usage(self, response: AIResponse, operation: str, success: bool = True, error: str | None = None) -> None:
        try:
            async with db_session() as session:
                log = APIUsageLog(
                    provider=response.provider,
                    operation=operation,
                    tokens_in=response.tokens_in,
                    tokens_out=response.tokens_out,
                    cost_usd=response.cost_usd,
                    duration_ms=response.duration_ms,
                    success=success,
                    error_message=error,
                )
                session.add(log)
                await session.commit()
        except Exception as exc:
            logger.warning("ai_router.log_failed", error=str(exc))

    async def _log_error(self, provider: str, operation: str, error: str, duration_ms: int = 0) -> None:
        try:
            async with db_session() as session:
                log = APIUsageLog(
                    provider=provider,
                    operation=operation,
                    cost_usd=0.0,
                    duration_ms=duration_ms,
                    success=False,
                    error_message=error,
                )
                session.add(log)
                await session.commit()
        except Exception:
            pass

    # ── LEVEL 1: Categorise ───────────────────────────────────────────────────

    async def categorize(
        self,
        title: str,
        description: str,
        platform: str,
        sample_titles: list[str] | None = None,
    ) -> CategorizationResult:
        """
        Groq (free) → GPT-4o-mini → Claude fallback.
        Returns niche, tags, language.
        """
        settings = await get_all_settings_dict()
        prompt = PROMPTS["categorize"]
        system = prompt["system"]
        user = prompt["user"].format(
            platform=platform,
            title=title or "(без названия)",
            description=(description or "")[:500],
            sample_titles=", ".join(sample_titles[:5]) if sample_titles else "—",
        )

        # Try Groq first
        groq_key = settings.get("groq_api_key", "")
        if groq_key and settings.get("ai_categorize", "groq") == "groq":
            try:
                parsed, resp = await self._groq_client(groq_key).complete_json(system, user, max_tokens=200)
                await self._log_usage(resp, "categorize")
                return _parse_categorization(parsed)
            except Exception as exc:
                logger.warning("ai_router.groq_categorize_failed", error=str(exc))
                await self._log_error("groq", "categorize", str(exc))

        # Fallback: GPT-4o-mini
        openai_key = settings.get("openai_api_key", "")
        if openai_key:
            try:
                parsed, resp = await self._openai_client(openai_key).complete_json(
                    system, user, model="gpt-4o-mini", max_tokens=200
                )
                await self._log_usage(resp, "categorize")
                return _parse_categorization(parsed)
            except Exception as exc:
                logger.warning("ai_router.openai_categorize_failed", error=str(exc))
                await self._log_error("openai", "categorize", str(exc))

        # Fallback: Claude
        claude_key = settings.get("anthropic_api_key", "")
        if claude_key:
            try:
                parsed, resp = await self._claude_client(claude_key).complete_json(
                    system, user, max_tokens=200
                )
                await self._log_usage(resp, "categorize")
                return _parse_categorization(parsed)
            except Exception as exc:
                logger.error("ai_router.all_categorize_failed", error=str(exc))

        # No providers available — return default
        logger.warning("ai_router.categorize_no_providers")
        return CategorizationResult(niche="общее", tags=[], language="ru")

    # ── LEVEL 1: Summarise transcript ─────────────────────────────────────────

    async def summarize_transcript(self, transcript: str) -> str:
        """GPT-4o-mini → Claude fallback."""
        settings = await get_all_settings_dict()
        prompt = PROMPTS["summarize"]
        system = prompt["system"]
        user = prompt["user"].format(transcript=transcript[:8000])

        openai_key = settings.get("openai_api_key", "")
        prefer = settings.get("ai_summarize", "openai")

        if prefer == "openai" and openai_key:
            try:
                resp = await self._openai_client(openai_key).complete(
                    system, user, model="gpt-4o-mini", max_tokens=500
                )
                await self._log_usage(resp, "summarize")
                return resp.text
            except Exception as exc:
                logger.warning("ai_router.openai_summarize_failed", error=str(exc))
                await self._log_error("openai", "summarize", str(exc))

        claude_key = settings.get("anthropic_api_key", "")
        if claude_key:
            try:
                resp = await self._claude_client(claude_key).complete(
                    system, user, max_tokens=500
                )
                await self._log_usage(resp, "summarize")
                return resp.text
            except Exception as exc:
                logger.error("ai_router.summarize_all_failed", error=str(exc))

        # Ultimate fallback: truncate the transcript itself
        return transcript[:1500]

    # ── LEVEL 3: Analyse video ────────────────────────────────────────────────

    async def analyze_video(self, data: VideoAnalysisInput) -> dict[str, Any]:
        """
        Claude Sonnet → GPT-4o fallback.
        Summarises long transcripts first (Level 1).
        """
        settings = await get_all_settings_dict()
        max_len = int(settings.get("max_transcript_length", "5000"))

        transcript = data.transcript
        if len(transcript) > max_len:
            logger.info("ai_router.summarising_transcript", original_len=len(transcript))
            transcript = await self.summarize_transcript(transcript)

        prompt = PROMPTS["analyze_video"]
        system = prompt["system"]
        user = prompt["user"].format(
            platform=data.platform,
            username=data.username,
            followers=data.followers,
            views=data.views,
            x_factor=data.x_factor,
            likes=data.likes,
            comments=data.comments,
            comment_rate=data.comment_rate,
            duration=data.duration,
            title=data.title or "(без названия)",
            description=(data.description or "")[:500],
            transcript=transcript or "(транскрипция недоступна)",
        )

        prefer = settings.get("ai_analyze", "claude")
        claude_key = settings.get("anthropic_api_key", "")
        openai_key = settings.get("openai_api_key", "")

        if prefer == "claude" and claude_key:
            try:
                parsed, resp = await self._claude_client(claude_key).complete_json(
                    system, user, max_tokens=2000
                )
                await self._log_usage(resp, "analyze")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.warning("ai_router.claude_analyze_failed", error=str(exc))
                await self._log_error("claude", "analyze", str(exc))

        if openai_key:
            try:
                parsed, resp = await self._openai_client(openai_key).complete_json(
                    system, user, model="gpt-4o", max_tokens=2000
                )
                await self._log_usage(resp, "analyze")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.error("ai_router.analyze_all_failed", error=str(exc))
                await self._log_error("openai", "analyze", str(exc))

        raise RuntimeError("Ни один AI-провайдер не доступен для анализа видео")

    # ── LEVEL 3: Generate scripts ─────────────────────────────────────────────

    async def generate_scripts(
        self,
        params: GenerateScriptRequest,
        ai_analysis: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Claude Sonnet → GPT-4o fallback.
        Returns list of script dicts.
        """
        settings = await get_all_settings_dict()
        prompt = PROMPTS["generate_script"]
        system = prompt["system"]
        user = prompt["user"].format(
            count=params.count,
            ai_analysis=json.dumps(ai_analysis, ensure_ascii=False, indent=2) if ai_analysis else "{}",
            topic=params.topic,
            platform=params.platform,
            duration=params.duration,
            style=params.style,
        )

        prefer = settings.get("ai_scripts", "claude")
        claude_key = settings.get("anthropic_api_key", "")
        openai_key = settings.get("openai_api_key", "")

        if prefer == "claude" and claude_key:
            try:
                parsed, resp = await self._claude_client(claude_key).complete_json(
                    system, user, max_tokens=3000
                )
                await self._log_usage(resp, "generate_script")
                return _normalise_scripts(parsed)
            except Exception as exc:
                logger.warning("ai_router.claude_scripts_failed", error=str(exc))
                await self._log_error("claude", "generate_script", str(exc))

        if openai_key:
            try:
                parsed, resp = await self._openai_client(openai_key).complete_json(
                    system, user, model="gpt-4o", max_tokens=3000
                )
                await self._log_usage(resp, "generate_script")
                return _normalise_scripts(parsed)
            except Exception as exc:
                logger.error("ai_router.scripts_all_failed", error=str(exc))
                await self._log_error("openai", "generate_script", str(exc))

        raise RuntimeError("Ни один AI-провайдер не доступен для генерации сценариев")

    # ── LEVEL 2: Blogger patterns ─────────────────────────────────────────────

    async def find_blogger_patterns(
        self, username: str, videos: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """GPT-4o → Claude fallback."""
        settings = await get_all_settings_dict()
        prompt = PROMPTS["find_patterns"]
        videos_json = json.dumps(videos[:30], ensure_ascii=False, indent=2)
        system = prompt["system"]
        user = prompt["user"].format(
            username=username,
            count=len(videos),
            videos_json=videos_json,
        )

        openai_key = settings.get("openai_api_key", "")
        claude_key = settings.get("anthropic_api_key", "")

        if openai_key:
            try:
                parsed, resp = await self._openai_client(openai_key).complete_json(
                    system, user, model="gpt-4o", max_tokens=1000
                )
                await self._log_usage(resp, "find_patterns")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.warning("ai_router.openai_patterns_failed", error=str(exc))

        if claude_key:
            try:
                parsed, resp = await self._claude_client(claude_key).complete_json(
                    system, user, max_tokens=1000
                )
                await self._log_usage(resp, "find_patterns")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.error("ai_router.patterns_all_failed", error=str(exc))

        return {}

    # ── LEVEL 2: Trend report ─────────────────────────────────────────────────

    async def generate_trend_report(
        self,
        outliers: list[dict[str, Any]],
        period: str,
        niche: str = "общее",
    ) -> dict[str, Any]:
        """GPT-4o → Claude fallback."""
        settings = await get_all_settings_dict()
        prompt = PROMPTS["trend_report"]
        system = prompt["system"]
        user = prompt["user"].format(
            period=period,
            niche=niche,
            count=len(outliers),
            outliers_json=json.dumps(outliers[:50], ensure_ascii=False, indent=2),
        )

        openai_key = settings.get("openai_api_key", "")
        claude_key = settings.get("anthropic_api_key", "")

        if openai_key:
            try:
                parsed, resp = await self._openai_client(openai_key).complete_json(
                    system, user, model="gpt-4o", max_tokens=1000
                )
                await self._log_usage(resp, "trend_report")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.warning("ai_router.openai_trend_failed", error=str(exc))

        if claude_key:
            try:
                parsed, resp = await self._claude_client(claude_key).complete_json(
                    system, user, max_tokens=1000
                )
                await self._log_usage(resp, "trend_report")
                return parsed if isinstance(parsed, dict) else {}
            except Exception as exc:
                logger.error("ai_router.trend_all_failed", error=str(exc))

        return {}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_categorization(data: dict | list) -> CategorizationResult:
    if isinstance(data, list):
        data = data[0] if data else {}
    return CategorizationResult(
        niche=str(data.get("niche", "общее")),
        tags=list(data.get("tags", [])),
        language=str(data.get("language", "ru")),
    )


def _normalise_scripts(data: dict | list) -> list[dict[str, Any]]:
    """Ensure we always return a list of script dicts."""
    if isinstance(data, dict):
        # Maybe wrapped: {"scripts": [...]} or single script
        if "scripts" in data:
            return list(data["scripts"])
        return [data]
    if isinstance(data, list):
        return data
    return []


# Module-level singleton
ai_router = AIRouter()
