"""
Instagram parser using instaloader (fallback).
Used when Apify is unavailable or not configured.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog

from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)


class LegacyInstagramParser(BasePlatformParser):
    platform = "instagram"

    def __init__(self, session_id: str | None = None) -> None:
        self._session_id = session_id

    def _get_loader(self) -> Any:
        import instaloader
        loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )
        if self._session_id:
            try:
                loader.load_session_from_file(
                    username="",
                    filename=None,
                )
            except Exception:
                pass
        return loader

    async def fetch_profile(self, username: str) -> BloggerProfile:
        import asyncio
        import instaloader

        def _fetch() -> BloggerProfile:
            loader = self._get_loader()
            try:
                profile = instaloader.Profile.from_username(loader.context, username)
                return BloggerProfile(
                    username=username,
                    display_name=profile.full_name,
                    avatar_url=profile.profile_pic_url,
                    followers_count=profile.followers,
                )
            except Exception as exc:
                logger.error("instagram_legacy.profile.error", username=username, error=str(exc))
                return BloggerProfile(username=username)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _fetch)

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        import asyncio
        import instaloader

        def _fetch() -> list[VideoData]:
            loader = self._get_loader()
            videos: list[VideoData] = []
            try:
                profile = instaloader.Profile.from_username(loader.context, username)
                count = 0
                for post in profile.get_posts():
                    if count >= limit:
                        break
                    if not post.is_video:
                        continue
                    published = post.date_utc.replace(tzinfo=None)
                    if after and published <= after:
                        break
                    short_code = post.shortcode
                    videos.append(
                        VideoData(
                            external_id=short_code,
                            url=f"https://www.instagram.com/p/{short_code}/",
                            title=post.caption[:200] if post.caption else None,
                            description=post.caption,
                            thumbnail_url=post.url,
                            views=post.video_view_count or 0,
                            likes=post.likes,
                            comments=post.comments,
                            shares=0,
                            duration=int(post.video_duration) if post.video_duration else None,
                            published_at=published,
                            platform="instagram",
                        )
                    )
                    count += 1
            except Exception as exc:
                logger.error("instagram_legacy.videos.error", username=username, error=str(exc))
            return videos

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _fetch)
        logger.info("instagram_legacy.fetched", username=username, count=len(result))
        return result

    async def get_video_url(self, video_id: str) -> str | None:
        return f"https://www.instagram.com/reel/{video_id}/"
