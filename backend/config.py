"""
Application configuration via Pydantic Settings.
Reads from .env file; runtime overrides come from the DB settings table.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── AI Providers ──────────────────────────────────────────────────────────
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    assemblyai_api_key: str = Field(default="", alias="ASSEMBLYAI_API_KEY")

    # ── Scraping ──────────────────────────────────────────────────────────────
    apify_api_key: str = Field(default="", alias="APIFY_API_KEY")
    vk_access_token: str = Field(default="", alias="VK_ACCESS_TOKEN")
    instagram_session_id: str = Field(default="", alias="INSTAGRAM_SESSION_ID")
    tiktok_api_key: str = Field(default="", alias="TIKTOK_API_KEY")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        default="sqlite+aiosqlite:///./data/local.db",
        alias="DATABASE_URL",
    )

    # ── App behaviour ─────────────────────────────────────────────────────────
    outlier_threshold: float = Field(default=3.0, alias="OUTLIER_THRESHOLD")
    refresh_interval_hours: int = Field(default=6, alias="REFRESH_INTERVAL_HOURS")
    max_videos_per_blogger: int = Field(default=50, alias="MAX_VIDEOS_PER_BLOGGER")

    # ── Admin ─────────────────────────────────────────────────────────────────
    admin_key: str = Field(default="", alias="ADMIN_KEY")

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    log_file: str = Field(default="logs/app.log", alias="LOG_FILE")


# Default DB-level settings seed (populated once on first startup)
DB_SETTINGS_DEFAULTS: dict[str, str] = {
    "anthropic_api_key": "",
    "openai_api_key": "",
    "groq_api_key": "",
    "assemblyai_api_key": "",
    "apify_api_key": "",
    "vk_access_token": "",
    "instagram_session_id": "",
    "tiktok_api_key": "",
    "outlier_threshold": "3.0",
    "refresh_interval_hours": "6",
    "max_videos_per_blogger": "50",
    "parser_instagram": "apify",        # apify | instaloader
    "parser_tiktok": "apify",           # apify | playwright
    "ai_analyze": "claude",             # claude | openai
    "ai_scripts": "claude",             # claude | openai
    "ai_categorize": "groq",            # groq | openai | claude
    "ai_summarize": "openai",           # openai | claude
    "transcription_provider": "assemblyai",  # assemblyai | youtube_only
    "auto_transcribe_outliers": "false",
    "max_transcript_length": "5000",
}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
