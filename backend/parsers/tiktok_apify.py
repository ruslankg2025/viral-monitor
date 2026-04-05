"""
TikTok parser using Apify actor (primary).
Actor: clockworks/free-tiktok-scraper
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from backend.parsers.apify_client import ApifyActorClient
from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)

ACTOR_ID = "clockworks/free-tiktok-scraper"


class ApifyTikTokParser(BasePlatformParser):
    platform = "tiktok"

    def __init__(self, api_key: str) -> None:
        self._actor = ApifyActorClient(api_key)

    async def fetch_profile(self, username: str) -> BloggerProfile:
        items = await self._actor.run_actor(
            ACTOR_ID,
            {"profiles": [username], "resultsPerPage": 1},
            timeout_secs=60,
        )
        if not items:
            return BloggerProfile(username=username)

        # Profile info is embedded in the first video's author data
        item = items[0]
        author = item.get("author") or item.get("authorMeta") or {}
        return BloggerProfile(
            username=author.get("name", username),
            display_name=author.get("nickName") or author.get("name"),
            avatar_url=author.get("avatar") or author.get("avatarThumb"),
            followers_count=int(
                author.get("fans") or author.get("followerCount") or 0
            ),
        )

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        items = await self._actor.run_actor(
            ACTOR_ID,
            {"profiles": [username], "resultsPerPage": limit},
            timeout_secs=120,
        )

        videos: list[VideoData] = []
        for item in items:
            create_time = item.get("createTime") or item.get("createTimeISO")
            published = _parse_timestamp(create_time)
            if after and published and published <= after:
                continue

            vid_id = str(item.get("id") or item.get("videoId") or "")
            if not vid_id:
                continue

            username_clean = (
                item.get("authorMeta", {}).get("name")
                or item.get("author", {}).get("uniqueId")
                or username
            )

            videos.append(
                VideoData(
                    external_id=vid_id,
                    url=item.get("webVideoUrl") or f"https://www.tiktok.com/@{username_clean}/video/{vid_id}",
                    title=item.get("text") or item.get("desc") or None,
                    description=item.get("text") or item.get("desc"),
                    thumbnail_url=item.get("covers", {}).get("default") or item.get("coverUrl"),
                    views=int(item.get("playCount") or item.get("stats", {}).get("playCount") or 0),
                    likes=int(item.get("diggCount") or item.get("stats", {}).get("diggCount") or 0),
                    comments=int(item.get("commentCount") or item.get("stats", {}).get("commentCount") or 0),
                    shares=int(item.get("shareCount") or item.get("stats", {}).get("shareCount") or 0),
                    duration=_parse_duration(item.get("videoMeta", {}).get("duration") or item.get("duration")),
                    published_at=published,
                    platform="tiktok",
                )
            )

        logger.info("tiktok_apify.fetched", username=username, count=len(videos))
        return videos

    async def get_video_url(self, video_id: str) -> str | None:
        # TikTok video URLs expire quickly; return page URL for AssemblyAI
        return f"https://www.tiktok.com/video/{video_id}"


def _parse_timestamp(ts: Any) -> datetime | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
        if isinstance(ts, str):
            ts = ts.rstrip("Z")
            return datetime.fromisoformat(ts)
    except Exception:
        return None
    return None


def _parse_duration(val: Any) -> int | None:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None
