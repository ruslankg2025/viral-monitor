"""
Transcription pipeline.
Priority:
1. YouTube subtitles via yt-dlp (free)
2. AssemblyAI (paid, all platforms)
3. Fallback: use title + description
"""
from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING

import httpx
import structlog

from backend.database import db_session
from backend.models import APIUsageLog

if TYPE_CHECKING:
    from backend.models import Video

logger = structlog.get_logger(__name__)

ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"
# Pricing: $0.37/hour of audio → ~$0.006167/min
ASSEMBLYAI_PRICE_PER_MIN = 0.37 / 60


class AssemblyAITranscriber:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def _headers(self) -> dict[str, str]:
        return {"authorization": self._api_key, "content-type": "application/json"}

    async def transcribe(self, audio_url: str) -> str | None:
        """
        Submit audio URL to AssemblyAI and poll until completion.
        Returns transcript text or None on failure.
        """
        async with httpx.AsyncClient(timeout=30) as client:
            # Submit
            resp = await client.post(
                f"{ASSEMBLYAI_BASE}/transcript",
                headers=self._headers(),
                json={"audio_url": audio_url, "language_detection": True},
            )
            resp.raise_for_status()
            job = resp.json()
            job_id = job["id"]

        # Poll
        async with httpx.AsyncClient(timeout=30) as client:
            for _ in range(200):  # max 10 minutes
                await asyncio.sleep(3)
                poll = await client.get(
                    f"{ASSEMBLYAI_BASE}/transcript/{job_id}",
                    headers=self._headers(),
                )
                poll.raise_for_status()
                result = poll.json()

                status = result.get("status")
                if status == "completed":
                    return result.get("text")
                elif status == "error":
                    error = result.get("error", "unknown")
                    logger.error("assemblyai.transcript_error", job_id=job_id, error=error)
                    return None

        logger.error("assemblyai.timeout", job_id=job_id)
        return None

    async def transcribe_with_cost_tracking(
        self,
        audio_url: str,
        duration_sec: int,
    ) -> str | None:
        start = time.monotonic()
        try:
            text = await self.transcribe(audio_url)
            success = text is not None
            duration_min = max(duration_sec, 1) / 60
            cost = duration_min * ASSEMBLYAI_PRICE_PER_MIN
        except Exception as exc:
            logger.error("assemblyai.error", error=str(exc))
            text = None
            success = False
            cost = 0.0

        duration_ms = int((time.monotonic() - start) * 1000)

        try:
            async with db_session() as session:
                log = APIUsageLog(
                    provider="assemblyai",
                    operation="transcribe",
                    tokens_in=0,
                    tokens_out=0,
                    cost_usd=cost if success else 0.0,
                    duration_ms=duration_ms,
                    success=success,
                )
                session.add(log)
                await session.commit()
        except Exception as log_exc:
            logger.warning("assemblyai.log_failed", error=str(log_exc))

        return text


async def get_transcript(video: "Video", settings: dict[str, str]) -> str | None:
    """
    Main transcription entry point.

    Step 1: YouTube → try subtitles via yt-dlp (free)
    Step 2: If no subtitles AND AssemblyAI configured → transcribe
    Step 3: Fallback → title + description snippet
    """
    max_len = int(settings.get("max_transcript_length", "5000"))
    provider = settings.get("transcription_provider", "assemblyai")

    # Step 1: YouTube subtitles
    if video.platform == "youtube":
        subtitle_text = await _get_youtube_subtitles(video.external_id)
        if subtitle_text:
            return subtitle_text[:max_len]

    # Step 2: AssemblyAI
    if provider == "assemblyai":
        assemblyai_key = settings.get("assemblyai_api_key", "")
        if assemblyai_key:
            audio_url = await _resolve_audio_url(video, settings)
            if audio_url:
                duration = video.duration or 60

                # Limit transcription for very long videos
                if duration > 600:
                    logger.info(
                        "transcriber.long_video_limit",
                        video_id=video.id,
                        duration=duration,
                    )
                    duration = 180  # Bill for 3 minutes only

                transcriber = AssemblyAITranscriber(assemblyai_key)
                text = await transcriber.transcribe_with_cost_tracking(audio_url, duration)
                if text:
                    return text[:max_len]

    # Step 3: Fallback
    fallback_parts = []
    if video.title:
        fallback_parts.append(f"Заголовок: {video.title}")
    if video.description:
        fallback_parts.append(f"Описание: {video.description[:500]}")

    return "\n".join(fallback_parts) if fallback_parts else None


async def _get_youtube_subtitles(video_id: str) -> str | None:
    """Delegate to YouTubeParser subtitle extraction."""
    try:
        from backend.parsers.youtube import YouTubeParser
        parser = YouTubeParser()
        return await parser.get_subtitles(video_id)
    except Exception as exc:
        logger.warning("transcriber.youtube_subtitles_failed", video_id=video_id, error=str(exc))
        return None


async def _resolve_audio_url(video: "Video", settings: dict[str, str]) -> str | None:
    """Get direct audio URL for the video using appropriate parser."""
    try:
        from backend.parsers.factory import parser_factory
        parser = parser_factory.get_parser(video.platform, settings)
        url = await parser.get_video_url(video.external_id)
        if not url:
            return video.url  # Fallback to page URL — AssemblyAI can sometimes handle it
        return url
    except Exception as exc:
        logger.warning("transcriber.resolve_url_failed", video_id=video.id, error=str(exc))
        return video.url
