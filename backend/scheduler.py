"""
APScheduler-based background task scheduler.
Runs periodic refresh for all active bloggers.
"""
from __future__ import annotations

import asyncio

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from backend.database import get_all_settings_dict

logger = structlog.get_logger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _refresh_job() -> None:
    """Periodic job: refresh all active bloggers."""
    try:
        settings = await get_all_settings_dict()
        from sqlalchemy import select
        from backend.database import db_session
        from backend.models import Blogger
        from backend.routers.bloggers import _background_fetch

        async with db_session() as db:
            result = await db.execute(
                select(Blogger).where(Blogger.is_active == True)  # noqa: E712
            )
            bloggers = result.scalars().all()
            blogger_ids = [b.id for b in bloggers]

        logger.info("scheduler.refresh_start", count=len(blogger_ids))

        # Sequential to avoid hammering all APIs simultaneously
        for blogger_id in blogger_ids:
            try:
                await _background_fetch(blogger_id)
                # Small delay between bloggers
                await asyncio.sleep(2)
            except Exception as exc:
                logger.error("scheduler.refresh_blogger_error", blogger_id=blogger_id, error=str(exc))

        logger.info("scheduler.refresh_done", count=len(blogger_ids))

        # Auto-transcribe outliers if setting enabled
        auto_transcribe = settings.get("auto_transcribe_outliers", "false").lower() == "true"
        if auto_transcribe:
            await _auto_transcribe_outliers(settings)

    except Exception as exc:
        logger.error("scheduler.refresh_job_error", error=str(exc))


async def _auto_transcribe_outliers(settings: dict[str, str]) -> None:
    """Transcribe any new outlier videos that don't have transcripts yet."""
    from sqlalchemy import select
    from backend.database import db_session
    from backend.models import Video
    from backend.transcriber import get_transcript

    try:
        async with db_session() as db:
            result = await db.execute(
                select(Video).where(
                    Video.is_outlier == True,  # noqa: E712
                    Video.transcript == None,  # noqa: E711
                ).limit(10)
            )
            videos = result.scalars().all()

        for video in videos:
            try:
                transcript = await get_transcript(video, settings)
                if transcript:
                    async with db_session() as db:
                        from sqlalchemy import update
                        from backend.models import Video as V
                        await db.execute(
                            update(V).where(V.id == video.id).values(transcript=transcript)
                        )
                        await db.commit()
                    logger.info("scheduler.auto_transcribed", video_id=video.id)
                await asyncio.sleep(5)
            except Exception as exc:
                logger.warning("scheduler.auto_transcribe_error", video_id=video.id, error=str(exc))

    except Exception as exc:
        logger.error("scheduler.auto_transcribe_outliers_error", error=str(exc))


async def start_scheduler() -> None:
    global _scheduler

    settings = await get_all_settings_dict()
    interval_hours = int(settings.get("refresh_interval_hours", "6"))

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _refresh_job,
        trigger=IntervalTrigger(hours=interval_hours),
        id="refresh_all_bloggers",
        name="Refresh all bloggers",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )
    _scheduler.start()
    logger.info("scheduler.started", interval_hours=interval_hours)


async def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler.stopped")


def reschedule(interval_hours: int) -> None:
    """Update scheduler interval at runtime (called when settings change)."""
    if _scheduler and _scheduler.running:
        _scheduler.reschedule_job(
            "refresh_all_bloggers",
            trigger=IntervalTrigger(hours=interval_hours),
        )
        logger.info("scheduler.rescheduled", interval_hours=interval_hours)
