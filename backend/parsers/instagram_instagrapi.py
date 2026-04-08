"""
Instagram parser using instagrapi (private mobile API).
More reliable than instaloader for authenticated access.
"""
from __future__ import annotations

from datetime import datetime
from urllib.parse import unquote

import structlog

from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)


class InstagrapiInstagramParser(BasePlatformParser):
    platform = "instagram"

    def __init__(
        self,
        session_id: str | None = None,
        session_json: str | None = None,
    ) -> None:
        self._session_id = unquote(session_id.strip()) if session_id else None
        self._session_json = session_json

    def _get_client(self):
        import json as _json
        from instagrapi import Client
        cl = Client()
        cl.delay_range = [1, 3]
        if self._session_json:
            cl.set_settings(_json.loads(self._session_json))
        elif self._session_id:
            cl.login_by_sessionid(self._session_id)
        else:
            raise ValueError("Требуется session_id или session_json")
        return cl

    async def fetch_profile(self, username: str) -> BloggerProfile:
        import asyncio
        loop = asyncio.get_event_loop()

        def _fetch() -> BloggerProfile:
            try:
                cl = self._get_client()
                user = cl.user_info_by_username(username)
                return BloggerProfile(
                    username=user.username,
                    display_name=user.full_name,
                    avatar_url=str(user.profile_pic_url) if user.profile_pic_url else None,
                    followers_count=user.follower_count,
                )
            except Exception as exc:
                logger.error("instagram_instagrapi.profile_error", username=username, error=str(exc))
                return BloggerProfile(username=username)

        return await loop.run_in_executor(None, _fetch)

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        import asyncio
        loop = asyncio.get_event_loop()

        def _fetch() -> list[VideoData]:
            videos: list[VideoData] = []
            try:
                cl = self._get_client()
                user_id = cl.user_id_from_username(username)

                # user_medias uses GraphQL and returns full stats including view_count
                try:
                    medias = cl.user_medias(user_id, amount=limit)
                except Exception:
                    medias = []

                # Also try user_clips for reels not in medias feed
                try:
                    clips = cl.user_clips(user_id, amount=limit)
                except Exception:
                    clips = []

                # Merge, deduplicate by pk — prefer medias (has full stats)
                seen: dict = {}
                for media in list(medias) + list(clips):
                    if media.pk not in seen:
                        seen[media.pk] = media
                    else:
                        # Keep the one with higher view_count (medias usually wins)
                        existing = seen[media.pk]
                        ev = (existing.view_count or 0) + (existing.play_count or 0)
                        mv = (media.view_count or 0) + (media.play_count or 0)
                        if mv > ev:
                            seen[media.pk] = media

                for media in seen.values():
                    # Only video types: 2=video, 8=album (may contain video)
                    if media.media_type not in (2, 8):
                        continue

                    published = media.taken_at.replace(tzinfo=None) if media.taken_at else None
                    if after and published and published <= after:
                        continue

                    # If view_count is 0, try fetching full media_info (costs 1 extra request)
                    view_count = media.view_count or media.play_count or 0
                    if view_count == 0:
                        try:
                            full = cl.media_info(media.pk)
                            view_count = full.view_count or full.play_count or 0
                            if full.thumbnail_url:
                                media.thumbnail_url = full.thumbnail_url
                        except Exception:
                            pass

                    thumb = str(media.thumbnail_url) if media.thumbnail_url else None
                    code = media.code or str(media.pk)

                    videos.append(VideoData(
                        external_id=code,
                        url=f"https://www.instagram.com/reel/{code}/",
                        title=(media.caption_text or "")[:200] or None,
                        description=media.caption_text,
                        thumbnail_url=thumb,
                        views=view_count,
                        likes=media.like_count or 0,
                        comments=media.comment_count or 0,
                        shares=0,
                        duration=int(media.video_duration) if media.video_duration else None,
                        published_at=published,
                        platform="instagram",
                    ))

                logger.info("instagram_instagrapi.fetched", username=username, count=len(videos))
            except Exception as exc:
                logger.error("instagram_instagrapi.videos_error", username=username, error=str(exc))
            return videos

        return await loop.run_in_executor(None, _fetch)

    async def get_video_url(self, video_id: str) -> str | None:
        return f"https://www.instagram.com/reel/{video_id}/"
