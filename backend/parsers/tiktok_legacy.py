"""
TikTok parser using Playwright (fallback).
Used when Apify is unavailable or not configured.
Note: TikTok aggressively blocks scrapers — this is best-effort.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any

import structlog

from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)


class LegacyTikTokParser(BasePlatformParser):
    platform = "tiktok"

    async def fetch_profile(self, username: str) -> BloggerProfile:
        data = await self._scrape_profile_page(username)
        if not data:
            return BloggerProfile(username=username)

        user_info = (
            data.get("userInfo", {})
            or data.get("UserPage", {}).get("uniqueId", {})
        )
        user = user_info.get("user", {})
        stats = user_info.get("stats", {})

        return BloggerProfile(
            username=user.get("uniqueId", username),
            display_name=user.get("nickname"),
            avatar_url=user.get("avatarThumb"),
            followers_count=int(stats.get("followerCount") or 0),
        )

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        logger.warning(
            "tiktok_legacy.playwright_scraping",
            username=username,
            note="This may fail due to TikTok anti-bot measures",
        )
        data = await self._scrape_profile_page(username)
        if not data:
            return []

        items = data.get("ItemList", {}).get("user-post", {}).get("list", [])
        videos: list[VideoData] = []

        for item_id in items[:limit]:
            item_data = data.get("ItemModule", {}).get(item_id, {})
            if not item_data:
                continue

            create_time = item_data.get("createTime")
            published: datetime | None = None
            if create_time:
                try:
                    published = datetime.fromtimestamp(int(create_time))
                except Exception:
                    pass

            if after and published and published <= after:
                continue

            stats = item_data.get("stats", {})
            video_info = item_data.get("video", {})
            author = item_data.get("author", username)
            if isinstance(author, dict):
                author = author.get("uniqueId", username)

            videos.append(
                VideoData(
                    external_id=item_id,
                    url=f"https://www.tiktok.com/@{author}/video/{item_id}",
                    title=item_data.get("desc"),
                    description=item_data.get("desc"),
                    thumbnail_url=video_info.get("cover") or video_info.get("originCover"),
                    views=int(stats.get("playCount") or 0),
                    likes=int(stats.get("diggCount") or 0),
                    comments=int(stats.get("commentCount") or 0),
                    shares=int(stats.get("shareCount") or 0),
                    duration=int(video_info.get("duration") or 0) or None,
                    published_at=published,
                    platform="tiktok",
                )
            )

        logger.info("tiktok_legacy.fetched", username=username, count=len(videos))
        return videos

    async def get_video_url(self, video_id: str) -> str | None:
        return None  # Not reliably obtainable without API

    async def _scrape_profile_page(self, username: str) -> dict[str, Any] | None:
        """Use Playwright to load the TikTok profile page and extract __UNIVERSAL_DATA__."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("tiktok_legacy.playwright_not_installed")
            return None

        url = f"https://www.tiktok.com/@{username}"
        try:
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    viewport={"width": 1280, "height": 800},
                )
                page = await context.new_page()
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                content = await page.content()
                await browser.close()

            # Extract JSON from __UNIVERSAL_DATA__
            match = re.search(
                r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
                content,
                re.DOTALL,
            )
            if not match:
                logger.warning("tiktok_legacy.no_universal_data", username=username)
                return None

            raw_json = match.group(1)
            data = json.loads(raw_json)
            return data.get("__DEFAULT_SCOPE__", data)

        except Exception as exc:
            logger.error("tiktok_legacy.scrape_error", username=username, error=str(exc))
            return None
