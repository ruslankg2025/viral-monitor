"""
VK platform parser using official VK API v5.199.
Supports both user profiles (id > 0) and communities (id < 0).
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime
from typing import Any

import httpx
import structlog

from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)

VK_API_BASE = "https://api.vk.com/method"
VK_API_VERSION = "5.199"
MAX_RPS = 3  # VK allows up to 3 req/sec


class VKParser(BasePlatformParser):
    platform = "vk"

    def __init__(self, access_token: str | None = None) -> None:
        self._token = access_token or ""
        self._last_request = 0.0

    async def _api_call(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Rate-limited VK API call."""
        # Enforce MAX_RPS
        now = time.monotonic()
        elapsed = now - self._last_request
        min_interval = 1.0 / MAX_RPS
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request = time.monotonic()

        params["v"] = VK_API_VERSION
        if self._token:
            params["access_token"] = self._token

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{VK_API_BASE}/{method}", params=params)
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            err = data["error"]
            raise RuntimeError(f"VK API error {err.get('error_code')}: {err.get('error_msg')}")

        return data.get("response", {})

    async def _resolve_owner_id(self, username: str) -> int:
        """Resolve screen name to numeric owner_id."""
        # If already numeric
        try:
            return int(username)
        except ValueError:
            pass

        response = await self._api_call(
            "utils.resolveScreenName",
            {"screen_name": username},
        )
        obj_type = response.get("type")
        obj_id = int(response.get("object_id", 0))

        if obj_type == "group" or obj_type == "page":
            return -obj_id  # Communities are negative
        return obj_id

    async def fetch_profile(self, username: str) -> BloggerProfile:
        try:
            owner_id = await self._resolve_owner_id(username)
        except Exception as exc:
            logger.error("vk.resolve_error", username=username, error=str(exc))
            return BloggerProfile(username=username)

        try:
            if owner_id < 0:
                # Group/community
                resp = await self._api_call(
                    "groups.getById",
                    {"group_id": abs(owner_id), "fields": "members_count,photo_200"},
                )
                groups = resp if isinstance(resp, list) else resp.get("groups", [])
                if groups:
                    g = groups[0]
                    return BloggerProfile(
                        username=g.get("screen_name", username),
                        display_name=g.get("name"),
                        avatar_url=g.get("photo_200"),
                        followers_count=int(g.get("members_count") or 0),
                    )
            else:
                # User profile
                resp = await self._api_call(
                    "users.get",
                    {
                        "user_ids": owner_id,
                        "fields": "followers_count,photo_200,screen_name",
                    },
                )
                users = resp if isinstance(resp, list) else []
                if users:
                    u = users[0]
                    return BloggerProfile(
                        username=u.get("screen_name", username),
                        display_name=f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
                        avatar_url=u.get("photo_200"),
                        followers_count=int(u.get("followers_count") or 0),
                    )
        except Exception as exc:
            logger.error("vk.fetch_profile.error", username=username, error=str(exc))

        return BloggerProfile(username=username)

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
    ) -> list[VideoData]:
        try:
            owner_id = await self._resolve_owner_id(username)
        except Exception as exc:
            logger.error("vk.resolve_error", username=username, error=str(exc))
            return []

        videos: list[VideoData] = []
        offset = 0
        batch_size = min(limit, 200)  # VK max count per request

        while len(videos) < limit:
            try:
                resp = await self._api_call(
                    "video.get",
                    {
                        "owner_id": owner_id,
                        "count": batch_size,
                        "offset": offset,
                        "extended": 1,
                    },
                )
            except Exception as exc:
                logger.error("vk.fetch_videos.error", username=username, error=str(exc))
                break

            items = resp.get("items", [])
            if not items:
                break

            for item in items:
                if len(videos) >= limit:
                    break

                date_ts = item.get("date")
                published: datetime | None = None
                if date_ts:
                    published = datetime.fromtimestamp(int(date_ts))

                if after and published and published <= after:
                    continue

                vid_id = str(item.get("id", ""))
                owner = str(item.get("owner_id", owner_id))
                external_id = f"{owner}_{vid_id}"

                # Thumbnail
                thumb = None
                for res in ("photo_800", "photo_640", "photo_320", "photo_130"):
                    if item.get(res):
                        thumb = item[res]
                        break

                videos.append(
                    VideoData(
                        external_id=external_id,
                        url=f"https://vk.com/video{external_id}",
                        title=item.get("title"),
                        description=item.get("description"),
                        thumbnail_url=thumb,
                        views=int(item.get("views") or 0),
                        likes=int(item.get("likes", {}).get("count") or 0),
                        comments=int(item.get("comments") or 0),
                        shares=int(item.get("reposts", {}).get("count") or 0),
                        duration=int(item.get("duration") or 0) or None,
                        published_at=published,
                        platform="vk",
                    )
                )

            if len(items) < batch_size:
                break
            offset += batch_size

        logger.info("vk.fetched", username=username, count=len(videos))
        return videos

    async def get_video_url(self, video_id: str) -> str | None:
        """
        Resolve a direct video URL for transcription.
        video_id format: "owner_id_video_id"
        """
        parts = video_id.split("_")
        if len(parts) != 2:
            return None
        owner_id, vid_id = parts
        try:
            resp = await self._api_call(
                "video.get",
                {"owner_id": owner_id, "videos": video_id, "extended": 0},
            )
            items = resp.get("items", [])
            if not items:
                return None
            # Return the highest resolution player URL
            item = items[0]
            for res in ("url_1080", "url_720", "url_480", "url_360", "url_240"):
                if item.get(res):
                    return item[res]
            return item.get("player")
        except Exception as exc:
            logger.warning("vk.get_video_url.error", video_id=video_id, error=str(exc))
            return None
