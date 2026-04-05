"""
X-Factor calculation and outlier detection.

X-Factor = video_views / blogger_median_views_last_30

A video is an outlier when x_factor >= outlier_threshold (default 3.0).
"""
from __future__ import annotations

import statistics
from datetime import datetime

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Blogger, Video

logger = structlog.get_logger(__name__)


def calculate_x_factor(video_views: int, blogger_avg_views: float) -> float:
    """Pure function: compute x_factor, minimum 1.0."""
    if blogger_avg_views <= 0:
        return 1.0
    return round(video_views / blogger_avg_views, 1)


def calculate_comment_rate(comments: int, views: int) -> float:
    """comments / views * 100, rounded to 1 decimal."""
    if views <= 0:
        return 0.0
    return round(comments / views * 100, 1)


async def update_blogger_stats(db: AsyncSession, blogger_id: int) -> float:
    """
    Recompute avg_views as the *median* of the most recent 30 videos.
    Requires at least 5 videos; otherwise keeps the current avg_views.
    Returns the new avg_views value.
    """
    result = await db.execute(
        select(Video.views)
        .where(Video.blogger_id == blogger_id)
        .order_by(Video.published_at.desc().nullslast())
        .limit(30)
    )
    view_counts: list[int] = [row[0] for row in result.fetchall()]

    if len(view_counts) < 5:
        logger.debug("analyzer.not_enough_videos", blogger_id=blogger_id, count=len(view_counts))
        return 0.0

    median_views = statistics.median(view_counts)

    # Count total tracked
    count_result = await db.execute(
        select(Video).where(Video.blogger_id == blogger_id)
    )
    total = len(count_result.scalars().all())

    await db.execute(
        update(Blogger)
        .where(Blogger.id == blogger_id)
        .values(avg_views=median_views, total_videos_tracked=total)
    )
    await db.commit()

    logger.info(
        "analyzer.blogger_stats_updated",
        blogger_id=blogger_id,
        median_views=median_views,
        total_videos=total,
    )
    return median_views


async def recalculate_all_x_factors(
    db: AsyncSession,
    blogger_id: int,
    threshold: float,
) -> int:
    """
    After avg_views is updated, recompute x_factor, is_outlier, comment_rate
    for ALL videos of this blogger.
    Returns number of videos updated.
    """
    blogger_result = await db.execute(
        select(Blogger).where(Blogger.id == blogger_id)
    )
    blogger = blogger_result.scalar_one_or_none()
    if blogger is None:
        logger.warning("analyzer.blogger_not_found", blogger_id=blogger_id)
        return 0

    avg_views = blogger.avg_views

    videos_result = await db.execute(
        select(Video).where(Video.blogger_id == blogger_id)
    )
    videos = videos_result.scalars().all()

    updated = 0
    for video in videos:
        xf = calculate_x_factor(video.views, avg_views)
        cr = calculate_comment_rate(video.comments, video.views)
        is_outlier = xf >= threshold

        await db.execute(
            update(Video)
            .where(Video.id == video.id)
            .values(x_factor=xf, is_outlier=is_outlier, comment_rate=cr)
        )
        updated += 1

    await db.commit()
    logger.info(
        "analyzer.x_factors_recalculated",
        blogger_id=blogger_id,
        updated=updated,
        threshold=threshold,
    )
    return updated


async def compute_and_save_video_metrics(
    db: AsyncSession,
    video: Video,
    blogger_avg_views: float,
    threshold: float,
) -> None:
    """
    Set x_factor, is_outlier, comment_rate on a freshly fetched video object.
    Called right after upsert, before commit.
    """
    video.x_factor = calculate_x_factor(video.views, blogger_avg_views)
    video.is_outlier = video.x_factor >= threshold
    video.comment_rate = calculate_comment_rate(video.comments, video.views)
