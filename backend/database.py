"""
Async SQLAlchemy engine, session factory, and DB initialisation.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.config import DB_SETTINGS_DEFAULTS, get_settings

logger = structlog.get_logger(__name__)


class Base(DeclarativeBase):
    pass


# ── Engine (lazy-initialised) ─────────────────────────────────────────────────
_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def _get_db_url() -> str:
    settings = get_settings()
    url = settings.database_url
    # Ensure data directory exists when using SQLite
    if "sqlite" in url:
        db_path = url.split("///")[-1]
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
    return url


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            _get_db_url(),
            echo=False,
            connect_args={"check_same_thread": False},
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _async_session_factory


# ── FastAPI dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Context manager helper (used outside request context) ─────────────────────
@asynccontextmanager
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Initialisation ────────────────────────────────────────────────────────────
async def init_db() -> None:
    """Create all tables and seed default settings."""
    from backend.models import Blogger, Video, Script, Setting, APIUsageLog  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_settings()
    logger.info("database.initialised")


async def _seed_settings() -> None:
    """Insert missing settings with defaults (idempotent).

    Priority: .env value (if non-empty) > DB existing value > hardcoded default.
    This means filling .env and restarting will populate the DB on first run.
    """
    from sqlalchemy import select
    from backend.models import Setting

    settings = get_settings()
    # Map DB setting keys → env/config attribute names
    ENV_MAP: dict[str, str] = {
        "anthropic_api_key": "anthropic_api_key",
        "openai_api_key": "openai_api_key",
        "groq_api_key": "groq_api_key",
        "assemblyai_api_key": "assemblyai_api_key",
        "apify_api_key": "apify_api_key",
        "vk_access_token": "vk_access_token",
        "instagram_session_id": "instagram_session_id",
        "tiktok_api_key": "tiktok_api_key",
        "outlier_threshold": "outlier_threshold",
        "refresh_interval_hours": "refresh_interval_hours",
        "max_videos_per_blogger": "max_videos_per_blogger",
    }

    async with db_session() as session:
        for key, default_value in DB_SETTINGS_DEFAULTS.items():
            result = await session.execute(select(Setting).where(Setting.key == key))
            existing = result.scalar_one_or_none()

            # Prefer value from .env if it's non-empty
            env_attr = ENV_MAP.get(key)
            env_value = str(getattr(settings, env_attr, "") or "") if env_attr else ""

            if existing is None:
                # New row: use .env value if set, otherwise default
                value = env_value if env_value.strip() else default_value
                session.add(Setting(key=key, value=value))
            elif env_value.strip() and not existing.value.strip():
                # Row exists but is empty → fill from .env
                existing.value = env_value

        await session.commit()
    logger.info("database.settings_seeded")


async def get_all_settings_dict() -> dict[str, str]:
    """Load all settings from DB into a plain dict."""
    from sqlalchemy import select
    from backend.models import Setting

    async with db_session() as session:
        result = await session.execute(select(Setting))
        rows = result.scalars().all()
        return {row.key: row.value for row in rows}
