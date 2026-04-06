"""
Bloggers CRUD router.
POST /api/bloggers      — add single blogger
POST /api/bloggers/import — bulk CSV import
GET  /api/bloggers      — list all
DELETE /api/bloggers/{id} — delete with cascade
POST /api/bloggers/{id}/refresh — trigger background refresh
"""
from __future__ import annotations

import asyncio
import csv
import io
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analyzer import (
    compute_and_save_video_metrics,
    recalculate_all_x_factors,
    update_blogger_stats,
)
from backend.database import get_all_settings_dict, get_db
from backend.models import Blogger, Video
from backend.parsers.factory import parser_factory
from backend.schemas import (
    BloggerCreate,
    BloggerImportResult,
    BloggerResponse,
    OkResponse,
    StatusResponse,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["bloggers"])

# Guard: set of blogger_ids currently being fetched (prevents duplicate concurrent runs)
_fetching: set[int] = set()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _blogger_to_response(blogger: Blogger) -> BloggerResponse:
    return BloggerResponse.model_validate(blogger)


async def _upsert_videos(
    db: AsyncSession,
    blogger: Blogger,
    video_data_list: list,
    settings: dict[str, str],
) -> int:
    """Insert new videos (skip existing), compute X-factor. Returns count of new videos."""
    from backend.database import get_all_settings_dict
    threshold = float(settings.get("outlier_threshold", "3.0"))
    new_count = 0

    for vd in video_data_list:
        # Check if exists
        existing = await db.execute(
            select(Video).where(
                Video.platform == vd.platform,
                Video.external_id == vd.external_id,
            )
        )
        if existing.scalar_one_or_none() is not None:
            continue

        video = Video(
            blogger_id=blogger.id,
            platform=vd.platform or blogger.platform,
            external_id=vd.external_id,
            url=vd.url,
            title=vd.title,
            description=vd.description,
            thumbnail_url=vd.thumbnail_url,
            views=vd.views,
            likes=vd.likes,
            comments=vd.comments,
            shares=vd.shares,
            duration=vd.duration,
            published_at=vd.published_at,
        )
        await compute_and_save_video_metrics(db, video, blogger.avg_views, threshold)
        db.add(video)
        new_count += 1

    await db.commit()
    return new_count


async def _background_fetch(blogger_id: int) -> None:
    """Full background fetch: profile → videos → stats → X-factors."""
    from backend.database import db_session
    from datetime import datetime

    # Deduplication guard — skip if already running for this blogger
    if blogger_id in _fetching:
        logger.info("bloggers.fetch_skipped_duplicate", blogger_id=blogger_id)
        return
    _fetching.add(blogger_id)

    try:
        settings = await get_all_settings_dict()
        max_videos = int(settings.get("max_videos_per_blogger", "50"))
        threshold = float(settings.get("outlier_threshold", "3.0"))

        async with db_session() as db:
            blogger_result = await db.execute(select(Blogger).where(Blogger.id == blogger_id))
            blogger = blogger_result.scalar_one_or_none()
            if not blogger:
                return

            parser = parser_factory.get_parser(blogger.platform, settings)

            # Fetch profile
            try:
                profile = await parser.fetch_profile(blogger.username)
                blogger.display_name = profile.display_name or blogger.display_name
                blogger.avatar_url = profile.avatar_url or blogger.avatar_url
                blogger.followers_count = profile.followers_count or blogger.followers_count
            except Exception as exc:
                logger.warning("bloggers.profile_fetch_failed", blogger_id=blogger_id, error=str(exc))

            # Fetch videos (incremental)
            after = blogger.last_checked_at
            try:
                # Pass shorts_only flag for YouTube channels added via /shorts URL
                fetch_kwargs: dict = dict(limit=max_videos, after=after)
                if blogger.platform == "youtube" and blogger.niche == "__shorts__":
                    fetch_kwargs["shorts_only"] = True
                videos = await parser.fetch_videos(blogger.username, **fetch_kwargs)
                for vd in videos:
                    if not vd.platform:
                        vd.platform = blogger.platform
            except Exception as exc:
                logger.error("bloggers.videos_fetch_failed", blogger_id=blogger_id, error=str(exc))
                videos = []

            if videos:
                await _upsert_videos(db, blogger, videos, settings)

            # Recalculate stats
            new_avg = await update_blogger_stats(db, blogger_id)
            if new_avg > 0:
                blogger.avg_views = new_avg
                await recalculate_all_x_factors(db, blogger_id, threshold)

            blogger.last_checked_at = datetime.utcnow()
            await db.commit()

        # AI categorise (fire-and-forget)
        asyncio.create_task(_ai_categorise_blogger(blogger_id))

        logger.info("bloggers.background_fetch_done", blogger_id=blogger_id, new_videos=len(videos))

    except Exception as exc:
        logger.error("bloggers.background_fetch_error", blogger_id=blogger_id, error=str(exc))
    finally:
        _fetching.discard(blogger_id)


async def _ai_categorise_blogger(blogger_id: int) -> None:
    """Determine blogger niche via AI and update all uncategorised videos."""
    from backend.ai.router import ai_router
    from backend.database import db_session

    try:
        async with db_session() as db:
            blogger_result = await db.execute(select(Blogger).where(Blogger.id == blogger_id))
            blogger = blogger_result.scalar_one_or_none()
            if not blogger:
                return

            videos_result = await db.execute(
                select(Video)
                .where(Video.blogger_id == blogger_id)
                .limit(10)
            )
            videos = videos_result.scalars().all()
            sample_titles = [v.title or "" for v in videos if v.title]

            if not sample_titles and not blogger.display_name:
                return

            cat = await ai_router.categorize(
                title=blogger.display_name or blogger.username,
                description="",
                platform=blogger.platform,
                sample_titles=sample_titles,
            )

            blogger.niche = cat.niche
            await db.commit()

    except Exception as exc:
        logger.warning("bloggers.ai_categorise_failed", blogger_id=blogger_id, error=str(exc))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/bloggers", response_model=list[BloggerResponse])
async def list_bloggers(db: Annotated[AsyncSession, Depends(get_db)]) -> list[BloggerResponse]:
    result = await db.execute(select(Blogger).order_by(Blogger.created_at.desc()))
    bloggers = result.scalars().all()
    return [_blogger_to_response(b) for b in bloggers]


@router.post("/bloggers", response_model=BloggerResponse, status_code=201)
async def create_blogger(
    body: BloggerCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerResponse:
    # Check for duplicates
    existing = await db.execute(
        select(Blogger).where(
            Blogger.platform == body.platform,
            Blogger.username == body.username,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Блогер @{body.username} на {body.platform} уже добавлен",
        )

    blogger = Blogger(
        platform=body.platform,
        username=body.username,
        niche="__shorts__" if body.shorts_only else None,
    )
    db.add(blogger)
    await db.commit()
    await db.refresh(blogger)

    # Kick off background fetch
    background_tasks.add_task(_background_fetch, blogger.id)

    logger.info("bloggers.created", blogger_id=blogger.id, platform=body.platform, username=body.username)
    return _blogger_to_response(blogger)


@router.post("/bloggers/import", response_model=BloggerImportResult)
async def import_bloggers(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> BloggerImportResult:
    """
    CSV or TXT file. Each line: platform,username
    Example:
      youtube,mkbhd
      instagram,cristiano
    """
    content = await file.read()
    text = content.decode("utf-8", errors="replace")

    imported = 0
    skipped = 0
    errors: list[str] = []

    reader = csv.reader(io.StringIO(text))
    for line_no, row in enumerate(reader, 1):
        if not row:
            continue
        # Strip whitespace
        row = [cell.strip() for cell in row]

        if len(row) < 2:
            # Try splitting by tab or space
            parts = row[0].split() if row else []
            if len(parts) >= 2:
                row = [parts[0], " ".join(parts[1:])]
            else:
                errors.append(f"Строка {line_no}: неверный формат — '{','.join(row)}'")
                continue

        platform_raw, username_raw = row[0], row[1]
        try:
            body = BloggerCreate(platform=platform_raw, username=username_raw)
        except Exception as exc:
            errors.append(f"Строка {line_no}: {exc}")
            continue

        existing = await db.execute(
            select(Blogger).where(
                Blogger.platform == body.platform,
                Blogger.username == body.username,
            )
        )
        if existing.scalar_one_or_none() is not None:
            skipped += 1
            continue

        blogger = Blogger(platform=body.platform, username=body.username)
        db.add(blogger)
        try:
            await db.flush()
            background_tasks.add_task(_background_fetch, blogger.id)
            imported += 1
        except IntegrityError:
            await db.rollback()
            skipped += 1

    await db.commit()
    return BloggerImportResult(imported=imported, skipped=skipped, errors=errors)


@router.delete("/bloggers/{blogger_id}", response_model=OkResponse)
async def delete_blogger(
    blogger_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    result = await db.execute(select(Blogger).where(Blogger.id == blogger_id))
    blogger = result.scalar_one_or_none()
    if not blogger:
        raise HTTPException(status_code=404, detail="Блогер не найден")

    await db.delete(blogger)
    await db.commit()
    logger.info("bloggers.deleted", blogger_id=blogger_id)
    return OkResponse()


@router.post("/bloggers/{blogger_id}/refresh", response_model=StatusResponse)
async def refresh_blogger(
    blogger_id: int,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatusResponse:
    result = await db.execute(select(Blogger).where(Blogger.id == blogger_id))
    blogger = result.scalar_one_or_none()
    if not blogger:
        raise HTTPException(status_code=404, detail="Блогер не найден")

    background_tasks.add_task(_background_fetch, blogger.id)
    return StatusResponse(status="started", message=f"Обновление @{blogger.username} запущено")
