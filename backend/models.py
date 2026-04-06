"""
SQLAlchemy 2.0 ORM models — multi-account system.
All timestamps stored as UTC naive datetimes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


# ── Accounts ──────────────────────────────────────────────────────────────────

class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    main_profiles: Mapped[list["MainProfile"]] = relationship(
        "MainProfile", back_populates="account", cascade="all, delete-orphan"
    )
    scraper_profiles: Mapped[list["ScraperProfile"]] = relationship(
        "ScraperProfile", back_populates="account", cascade="all, delete-orphan"
    )
    bloggers: Mapped[list["Blogger"]] = relationship(
        "Blogger", back_populates="account", cascade="all, delete-orphan"
    )
    scripts: Mapped[list["Script"]] = relationship(
        "Script", back_populates="account", cascade="all, delete-orphan"
    )


class MainProfile(Base):
    __tablename__ = "main_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # instagram | tiktok
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    followers_count: Mapped[int] = mapped_column(Integer, default=0)
    session_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # instagrapi session
    status: Mapped[str] = mapped_column(
        String(20), default="not_logged_in"
    )  # active|expired|banned|not_logged_in
    # Profile/generation settings
    niche: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tone: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # conversational|expert|energetic|calm|custom
    tone_custom: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_format: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # head+visual|head_only|screencast|custom
    video_format_custom: Mapped[str | None] = mapped_column(Text, nullable=True)
    audience_desc: Mapped[str | None] = mapped_column(Text, nullable=True)
    banned_words: Mapped[str | None] = mapped_column(Text, nullable=True)  # comma-separated
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    account: Mapped["Account"] = relationship("Account", back_populates="main_profiles")


class ScraperProfile(Base):
    __tablename__ = "scraper_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # instagram | tiktok
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    password: Mapped[str | None] = mapped_column(
        String(200), nullable=True
    )  # stored for re-login
    session_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="not_logged_in"
    )  # active|expired|banned|not_logged_in
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    account: Mapped["Account"] = relationship("Account", back_populates="scraper_profiles")


# ── Bloggers ──────────────────────────────────────────────────────────────────

class Blogger(Base):
    __tablename__ = "bloggers"
    __table_args__ = (
        UniqueConstraint(
            "account_id", "platform", "username",
            name="uq_blogger_account_platform_username",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    followers_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_views: Mapped[float] = mapped_column(Float, default=0.0)
    total_videos_tracked: Mapped[int] = mapped_column(Integer, default=0)
    niche: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, nullable=False
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    account: Mapped["Account | None"] = relationship("Account", back_populates="bloggers")
    videos: Mapped[list["Video"]] = relationship(
        "Video",
        back_populates="blogger",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# ── Videos ────────────────────────────────────────────────────────────────────

class Video(Base):
    __tablename__ = "videos"
    __table_args__ = (
        UniqueConstraint("platform", "external_id", name="uq_video_platform_external_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    blogger_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("bloggers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    duration: Mapped[int | None] = mapped_column(Integer, nullable=True)  # seconds
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    x_factor: Mapped[float] = mapped_column(Float, default=1.0, index=True)
    is_outlier: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    comment_rate: Mapped[float] = mapped_column(Float, default=0.0)
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    niche: Mapped[str | None] = mapped_column(String(100), nullable=True)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_favorited: Mapped[bool] = mapped_column(Boolean, default=False)
    is_analyzed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_standalone: Mapped[bool] = mapped_column(Boolean, default=False)  # parsed via /analyze-url
    hooks: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    reel_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    blogger: Mapped["Blogger"] = relationship("Blogger", back_populates="videos")
    scripts: Mapped[list["Script"]] = relationship(
        "Script",
        back_populates="video",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


# ── Scripts ───────────────────────────────────────────────────────────────────

class Script(Base):
    __tablename__ = "scripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    video_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("videos.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    hook: Mapped[str | None] = mapped_column(Text, nullable=True)
    hook_visual: Mapped[str | None] = mapped_column(Text, nullable=True)
    structure: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    niche: Mapped[str | None] = mapped_column(String(100), nullable=True)
    platform_target: Mapped[str | None] = mapped_column(String(20), nullable=True)
    style: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_target: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hashtags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    shooting_tips: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, onupdate=_utcnow, nullable=True
    )

    account: Mapped["Account | None"] = relationship("Account", back_populates="scripts")
    video: Mapped["Video | None"] = relationship("Video", back_populates="scripts")


# ── Settings ──────────────────────────────────────────────────────────────────

class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, onupdate=_utcnow, nullable=True
    )


# ── API Usage Log ─────────────────────────────────────────────────────────────

class APIUsageLog(Base):
    __tablename__ = "api_usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
