"""
YouTube parser using yt-dlp programmatic API.
No subprocess — pure Python API.
"""
from __future__ import annotations

import asyncio
import io
import random
import re
from datetime import datetime
from typing import Any

import structlog
import yt_dlp

from backend.parsers.base import BasePlatformParser
from backend.schemas import BloggerProfile, VideoData

logger = structlog.get_logger(__name__)


def _parse_upload_date(date_str: str | None) -> datetime | None:
    """Parse yt-dlp upload_date string 'YYYYMMDD' → datetime."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%Y%m%d")
    except ValueError:
        return None


def _build_video_url(entry: dict[str, Any]) -> str:
    vid_id = entry.get("id", "")
    return f"https://www.youtube.com/watch?v={vid_id}"


class YouTubeParser(BasePlatformParser):
    platform = "youtube"

    # Common yt-dlp options for all calls
    _BASE_OPTS: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "ignoreerrors": True,
        "extract_flat": "in_playlist",
        "socket_timeout": 30,
    }

    async def fetch_profile(self, username: str) -> BloggerProfile:
        """
        Fetch basic channel info.
        yt-dlp channel URL: https://www.youtube.com/@{username}
        """
        channel_url = f"https://www.youtube.com/@{username}"
        opts = {**self._BASE_OPTS, "playlistend": 1}

        def _extract() -> dict[str, Any]:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(channel_url, download=False)
                return info or {}

        loop = asyncio.get_event_loop()
        try:
            info = await loop.run_in_executor(None, _extract)
        except Exception as exc:
            logger.error("youtube.fetch_profile.error", username=username, error=str(exc))
            return BloggerProfile(username=username)

        display_name = (
            info.get("channel")
            or info.get("uploader")
            or info.get("title")
            or username
        )
        # Follower count (subscriber_count may be None for some channels)
        followers = info.get("channel_follower_count") or info.get("subscriber_count") or 0
        thumbnail = info.get("thumbnail") or info.get("thumbnails", [{}])[-1].get("url")

        return BloggerProfile(
            username=username,
            display_name=display_name,
            avatar_url=thumbnail,
            followers_count=int(followers),
        )

    async def fetch_videos(
        self,
        username: str,
        limit: int = 50,
        after: datetime | None = None,
        shorts_only: bool = False,
    ) -> list[VideoData]:
        """
        Fetch latest `limit` videos from the channel.
        If shorts_only=True, fetches from /shorts tab.
        If `after` is provided, only include videos published after that date.
        """
        tab = "shorts" if shorts_only else "videos"
        channel_url = f"https://www.youtube.com/@{username}/{tab}"
        opts = {
            **self._BASE_OPTS,
            "playlistend": limit,
        }

        def _extract() -> list[dict[str, Any]]:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(channel_url, download=False)
                if not info:
                    return []
                entries = info.get("entries") or []
                return list(entries)

        loop = asyncio.get_event_loop()
        try:
            raw_entries = await loop.run_in_executor(None, _extract)
        except Exception as exc:
            logger.error("youtube.fetch_videos.error", username=username, error=str(exc))
            return []

        videos: list[VideoData] = []
        for entry in raw_entries:
            if not entry or not entry.get("id"):
                continue

            published = _parse_upload_date(entry.get("upload_date"))

            # Incremental filter
            if after and published and published <= after:
                continue

            thumbnails = entry.get("thumbnails") or []
            thumbnail_url: str | None = None
            if thumbnails:
                # Prefer highest resolution
                thumbnail_url = thumbnails[-1].get("url")
            if not thumbnail_url:
                vid_id = entry.get("id", "")
                thumbnail_url = f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg"

            videos.append(
                VideoData(
                    external_id=entry["id"],
                    url=_build_video_url(entry),
                    title=entry.get("title"),
                    description=entry.get("description"),
                    thumbnail_url=thumbnail_url,
                    views=int(entry.get("view_count") or 0),
                    likes=int(entry.get("like_count") or 0),
                    comments=int(entry.get("comment_count") or 0),
                    shares=0,  # YouTube API doesn't expose shares
                    duration=int(entry.get("duration") or 0) or None,
                    published_at=published,
                    platform="youtube",
                )
            )

            # Rate limiting between requests
            await asyncio.sleep(random.uniform(0.5, 1.5))

        logger.info(
            "youtube.fetch_videos.done",
            username=username,
            count=len(videos),
            incremental=after is not None,
        )
        return videos

    async def get_video_url(self, video_id: str) -> str | None:
        """
        Extract the best audio URL for a given video ID.
        Used by AssemblyAI for transcription.
        """
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        opts = {
            **self._BASE_OPTS,
            "format": "bestaudio/best",
            "extract_flat": False,
        }

        def _extract() -> str | None:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                if not info:
                    return None
                return info.get("url")

        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, _extract)
        except Exception as exc:
            logger.error("youtube.get_video_url.error", video_id=video_id, error=str(exc))
            return None

    async def get_subtitles(self, video_id: str, langs: list[str] | None = None) -> str | None:
        """
        Extract auto-generated or manual subtitles as plain text.
        Returns None if no subtitles available.
        """
        if langs is None:
            langs = ["ru", "en"]

        video_url = f"https://www.youtube.com/watch?v={video_id}"
        opts = {
            **self._BASE_OPTS,
            "extract_flat": False,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": langs,
            "skip_download": True,
        }

        def _extract() -> str | None:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(video_url, download=False)
                if not info:
                    return None

                # Try manual subtitles first, then auto
                for sub_type in ("subtitles", "automatic_captions"):
                    subs = info.get(sub_type, {})
                    if not subs:
                        continue
                    for lang in langs:
                        if lang in subs:
                            entries = subs[lang]
                            # Prefer json3 or vtt format
                            for fmt in ("json3", "vtt", "srv3"):
                                for entry in entries:
                                    if entry.get("ext") == fmt and entry.get("url"):
                                        return _fetch_subtitle_text(entry["url"])
                return None

        loop = asyncio.get_event_loop()
        try:
            return await loop.run_in_executor(None, _extract)
        except Exception as exc:
            logger.warning("youtube.subtitles.error", video_id=video_id, error=str(exc))
            return None


def _fetch_subtitle_text(url: str) -> str | None:
    """Download subtitle content and extract plain text."""
    import urllib.request
    import json
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            content = resp.read().decode("utf-8")

        # json3 format
        if url.endswith(".json3") or "json3" in url:
            data = json.loads(content)
            events = data.get("events", [])
            text_parts = []
            for event in events:
                segs = event.get("segs", [])
                for seg in segs:
                    t = seg.get("utf8", "")
                    if t and t != "\n":
                        text_parts.append(t)
            return " ".join(text_parts).strip() or None

        # VTT / plain text fallback — strip timestamps
        lines = content.split("\n")
        text_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith("WEBVTT") or "-->" in line or line.isdigit():
                continue
            # Strip HTML tags
            clean = re.sub(r"<[^>]+>", "", line)
            if clean:
                text_lines.append(clean)
        return " ".join(text_lines).strip() or None

    except Exception:
        return None
