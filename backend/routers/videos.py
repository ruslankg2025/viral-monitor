"""
Videos router.
GET  /api/videos          — paginated feed with filters
GET  /api/videos/{id}     — video detail
POST /api/videos/{id}/favorite — toggle favourite
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import Blogger, Video
from backend.schemas import (
    FavoriteToggleResponse,
    VideoDetailResponse,
    VideoResponse,
    VideosPage,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["videos"])


def _make_video_response(video: Video) -> VideoResponse:
    data = VideoResponse.model_validate(video)
    if video.blogger:
        data.blogger_username = video.blogger.username
        data.blogger_display_name = video.blogger.display_name
        data.blogger_avatar_url = video.blogger.avatar_url
        data.blogger_followers_count = video.blogger.followers_count
        data.blogger_avg_views = video.blogger.avg_views
    return data


def _make_video_detail(video: Video) -> VideoDetailResponse:
    data = VideoDetailResponse.model_validate(video)
    if video.blogger:
        data.blogger_username = video.blogger.username
        data.blogger_display_name = video.blogger.display_name
        data.blogger_avatar_url = video.blogger.avatar_url
        data.blogger_followers_count = video.blogger.followers_count
        data.blogger_avg_views = video.blogger.avg_views
    return data


@router.get("/videos", response_model=VideosPage)
async def list_videos(
    db: Annotated[AsyncSession, Depends(get_db)],
    platform: str | None = Query(None),
    blogger_id: int | None = Query(None),
    period: str | None = Query(None, description="today|week|month"),
    sort: str = Query("x_factor", description="x_factor|published_at|views|comment_rate"),
    outliers_only: bool = Query(False),
    favorited_only: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
) -> VideosPage:
    stmt = (
        select(Video)
        .join(Blogger, Video.blogger_id == Blogger.id)
        .options(selectinload(Video.blogger))
    )

    # Filters
    if platform:
        stmt = stmt.where(Video.platform == platform.lower())
    if blogger_id:
        stmt = stmt.where(Video.blogger_id == blogger_id)
    if outliers_only:
        stmt = stmt.where(Video.is_outlier == True)  # noqa: E712
    if favorited_only:
        stmt = stmt.where(Video.is_favorited == True)  # noqa: E712

    if period:
        cutoff: datetime | None = None
        now = datetime.utcnow()
        if period == "today":
            cutoff = now - timedelta(hours=24)
        elif period == "week":
            cutoff = now - timedelta(days=7)
        elif period == "month":
            cutoff = now - timedelta(days=30)
        if cutoff:
            stmt = stmt.where(Video.published_at >= cutoff)

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Sort
    sort_map = {
        "x_factor": desc(Video.x_factor),
        "published_at": desc(Video.published_at),
        "views": desc(Video.views),
        "comment_rate": desc(Video.comment_rate),
    }
    order_col = sort_map.get(sort, desc(Video.x_factor))
    stmt = stmt.order_by(order_col).offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(stmt)
    videos = result.scalars().all()

    pages = max(1, (total + per_page - 1) // per_page)
    return VideosPage(
        items=[_make_video_response(v) for v in videos],
        total=total,
        page=page,
        pages=pages,
    )


@router.get("/videos/{video_id}", response_model=VideoDetailResponse)
async def get_video(
    video_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VideoDetailResponse:
    result = await db.execute(
        select(Video)
        .options(selectinload(Video.blogger))
        .where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")
    return _make_video_detail(video)


@router.post("/videos/{video_id}/favorite", response_model=FavoriteToggleResponse)
async def toggle_favorite(
    video_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FavoriteToggleResponse:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    video.is_favorited = not video.is_favorited
    await db.commit()
    return FavoriteToggleResponse(is_favorited=video.is_favorited)
