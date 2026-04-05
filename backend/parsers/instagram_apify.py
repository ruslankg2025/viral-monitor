"""
Instagram parser using Apify actor (primary).
Actor: apify/instagram-scraper
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from backend.parsers.apify_client import ApifyActorClient
from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)

ACTOR_ID = "apify/instagram-scraper"
PROFILE_ACTOR_ID = "apify/instagram-profile-scraper"


class ApifyInstagramParser(BasePlatformParser):
    platform = "instagram"

    def __init__(self, api_key: str) -> None:
        self._actor = ApifyActorClient(api_key)

    async def fetch_profile(self, username: str) -> BloggerProfile:
        items = await self._actor.run_actor(
            PROFILE_ACTOR_ID,
            {"usernames": [username]},
            timeout_secs=60,
        )
        if not items:
            logger.warning("instagram_apify.profile_empty", username=username)
            return BloggerProfile(username=username)

        data = items[0]
        return BloggerProfile(
            username=data.get("username", username),
            display_name=data.get("fullName") or data.get("full_name"),
            avatar_url=data.get("profilePicUrl") or data.get("profilePicUrlHD"),
            followers_count=int(data.get("followersCount") or data.get("followers_count") or 0),
        )

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        items = await self._actor.run_actor(
            ACTOR_ID,
            {
                "usernames": [username],
                "resultsLimit": limit,
                "onlyPostsWithMedia": True,
            },
            timeout_secs=120,
        )

        videos: list[VideoData] = []
        for item in items:
            published = _parse_timestamp(item.get("timestamp") or item.get("taken_at_timestamp"))
            if after and published and published <= after:
                continue

            video_id = item.get("shortCode") or item.get("id") or item.get("shortcode", "")
            if not video_id:
                continue

            views = int(
                item.get("videoViewCount")
                or item.get("video_view_count")
                or item.get("playCount")
                or item.get("likesCount")  # fallback for images
                or 0
            )

            videos.append(
                VideoData(
                    external_id=video_id,
                    url=f"https://www.instagram.com/reel/{video_id}/",
                    title=_truncate(item.get("caption") or item.get("alt"), 200),
                    description=item.get("caption") or item.get("alt"),
                    thumbnail_url=item.get("displayUrl") or item.get("thumbnailUrl"),
                    views=views,
                    likes=int(item.get("likesCount") or item.get("likes_count") or 0),
                    comments=int(item.get("commentsCount") or item.get("comments_count") or 0),
                    shares=0,
                    duration=_parse_duration(item.get("videoDuration") or item.get("video_duration")),
                    published_at=published,
                    platform="instagram",
                )
            )

        logger.info("instagram_apify.fetched", username=username, count=len(videos))
        return videos

    async def get_video_url(self, video_id: str) -> str | None:
        items = await self._actor.run_actor(
            ACTOR_ID,
            {"directUrls": [f"https://www.instagram.com/reel/{video_id}/"]},
            timeout_secs=60,
        )
        if not items:
            return None
        item = items[0]
        return item.get("videoUrl") or item.get("video_url")


def _parse_timestamp(ts: Any) -> datetime | None:
    if ts is None:
        return None
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
        if isinstance(ts, str):
            # ISO format
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


def _truncate(text: str | None, length: int) -> str | None:
    if not text:
        return None
    return text[:length]
