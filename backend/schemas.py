"""
Pydantic v2 request / response schemas.
Strict typing throughout — no Optional without explicit None default.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ── Shared helpers ────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── Platform literals ─────────────────────────────────────────────────────────

PLATFORMS = {"youtube", "instagram", "tiktok", "vk"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Parser output schemas (used internally between parsers and DB layer)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BloggerProfile(BaseModel):
    """Raw profile data returned by a platform parser."""
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    followers_count: int = 0


class VideoData(BaseModel):
    """Raw video data returned by a platform parser."""
    external_id: str
    url: str
    title: str | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    duration: int | None = None        # seconds
    published_at: datetime | None = None
    platform: str = ""                 # filled by factory before upsert


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Blogger schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class BloggerCreate(BaseModel):
    platform: str
    username: str

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in PLATFORMS:
            raise ValueError(f"Платформа должна быть одной из: {', '.join(PLATFORMS)}")
        return v

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        v = v.strip().lstrip("@").lower()
        # Strip full URLs to bare username
        for prefix in (
            "https://www.youtube.com/@",
            "https://youtube.com/@",
            "https://www.instagram.com/",
            "https://instagram.com/",
            "https://www.tiktok.com/@",
            "https://tiktok.com/@",
            "https://vk.com/",
        ):
            if v.startswith(prefix):
                v = v[len(prefix):]
        v = v.rstrip("/").split("/")[0].split("?")[0]
        return v


class BloggerResponse(OrmBase):
    id: int
    platform: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    followers_count: int
    avg_views: float
    total_videos_tracked: int
    niche: str | None = None
    is_active: bool
    created_at: datetime
    last_checked_at: datetime | None = None


class BloggerImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[str]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Video schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class VideoResponse(OrmBase):
    id: int
    blogger_id: int
    platform: str
    external_id: str
    url: str
    title: str | None = None
    thumbnail_url: str | None = None
    views: int
    likes: int
    comments: int
    shares: int
    duration: int | None = None
    published_at: datetime | None = None
    fetched_at: datetime
    x_factor: float
    is_outlier: bool
    comment_rate: float
    tags: list[str] | None = None
    niche: str | None = None
    language: str | None = None
    is_favorited: bool
    is_analyzed: bool
    # Denormalised blogger info
    blogger_username: str = ""
    blogger_display_name: str | None = None
    blogger_avatar_url: str | None = None
    blogger_followers_count: int = 0
    blogger_avg_views: float = 0.0


class VideoDetailResponse(VideoResponse):
    description: str | None = None
    transcript: str | None = None
    ai_analysis: dict[str, Any] | None = None


class VideosPage(BaseModel):
    items: list[VideoResponse]
    total: int
    page: int
    pages: int


class FavoriteToggleResponse(BaseModel):
    is_favorited: bool


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Analysis schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AnalysisStatusResponse(BaseModel):
    status: str  # "pending" | "running" | "done" | "error"
    message: str | None = None


class VideoAnalysisInput(BaseModel):
    """Internal DTO passed to AIRouter.analyze_video."""
    platform: str
    username: str
    followers: int
    views: int
    x_factor: float
    likes: int
    comments: int
    comment_rate: float
    duration: int
    title: str
    description: str
    transcript: str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Script schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class GenerateScriptRequest(BaseModel):
    video_id: int | None = None
    topic: str = Field(..., min_length=2, max_length=500)
    platform: str = "instagram"
    duration: str = "60s"   # 15s | 30s | 60s | 3min
    style: str = "adapt_hook"  # adapt_hook | copy_structure | technique_only | original
    count: int = Field(default=1, ge=1, le=5)


class ScriptResponse(OrmBase):
    id: int
    video_id: int | None = None
    title: str
    hook: str | None = None
    hook_visual: str | None = None
    niche: str | None = None
    platform_target: str | None = None
    style: str | None = None
    duration_target: str | None = None
    hashtags: list[str] | None = None
    created_at: datetime
    updated_at: datetime | None = None


class ScriptDetailResponse(ScriptResponse):
    structure: list[dict[str, Any]] | None = None
    full_text: str | None = None
    shooting_tips: str | None = None


class ScriptUpdate(BaseModel):
    title: str | None = None
    hook: str | None = None
    hook_visual: str | None = None
    full_text: str | None = None
    hashtags: list[str] | None = None
    shooting_tips: str | None = None
    structure: list[dict[str, Any]] | None = None


class ScriptsPage(BaseModel):
    items: list[ScriptResponse]
    total: int


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Settings schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class SettingsResponse(BaseModel):
    settings: dict[str, str]


class SettingsUpdate(BaseModel):
    updates: dict[str, str]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Stats & Costs schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class AppStats(BaseModel):
    total_bloggers: int
    active_bloggers: int
    total_videos: int
    outlier_videos: int
    total_scripts: int
    last_refresh: datetime | None = None


class ProviderCost(BaseModel):
    provider: str
    requests: int
    tokens_in: int
    tokens_out: int
    cost_usd: float


class CostsResponse(BaseModel):
    by_provider: list[ProviderCost]
    total_cost: float
    period: str


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Generic responses
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class StatusResponse(BaseModel):
    status: str
    message: str | None = None


class OkResponse(BaseModel):
    ok: bool = True


class RecalcResponse(BaseModel):
    updated: int
