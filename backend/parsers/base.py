"""
Abstract base class for all platform parsers.
Every parser must implement fetch_profile, fetch_videos, get_video_url.
"""
from __future__ import annotations

import asyncio
import random
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Awaitable, TypeVar

import structlog

from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)

T = TypeVar("T")


class BasePlatformParser(ABC):
    platform: str = ""

    @abstractmethod
    async def fetch_profile(self, username: str) -> BloggerProfile:
        """Fetch profile metadata: display_name, avatar, followers."""
        ...

    @abstractmethod
    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        """
        Fetch videos for a user.
        If `after` is provided, return only videos published after that datetime
        (incremental / delta fetch).
        """
        ...

    @abstractmethod
    async def get_video_url(self, video_id: str) -> str | None:
        """Return a direct audio/video URL suitable for transcription."""
        ...

    async def safe_fetch(
        self,
        coro: Awaitable[T],
        context: str,
        retries: int = 2,
    ) -> T | None:
        """
        Await a coroutine with exponential backoff retry.
        Returns None on persistent failure (does not raise).
        """
        delay = 1.0
        for attempt in range(retries + 1):
            try:
                return await coro
            except Exception as exc:
                if attempt < retries:
                    jitter = random.uniform(0, 0.5)
                    logger.warning(
                        "parser.retry",
                        context=context,
                        attempt=attempt + 1,
                        delay=delay,
                        error=str(exc),
                    )
                    await asyncio.sleep(delay + jitter)
                    delay *= 3
                else:
                    logger.error(
                        "parser.failed",
                        context=context,
                        error=str(exc),
                        exc_info=exc,
                    )
                    return None
        return None  # unreachable but satisfies type checker
