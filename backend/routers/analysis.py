"""
Analysis router.
POST /api/videos/{id}/analyze        — trigger AI analysis (background)
GET  /api/videos/{id}/analysis-status — check status
"""
from __future__ import annotations

import asyncio
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.ai.router import ai_router
from backend.database import get_all_settings_dict, get_db
from backend.database import db_session
from backend.models import Blogger, Video
from backend.schemas import AnalysisStatusResponse, StatusResponse, VideoAnalysisInput

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["analysis"])

# In-memory status tracker (per video_id)
_analysis_status: dict[int, str] = {}  # "pending" | "running" | "done" | "error"


async def _run_analysis(video_id: int) -> None:
    """Full analysis pipeline: transcript → summarise → analyse → save."""
    _analysis_status[video_id] = "running"

    try:
        settings = await get_all_settings_dict()

        async with db_session() as db:
            result = await db.execute(
                select(Video)
                .options(selectinload(Video.blogger))
                .where(Video.id == video_id)
            )
            video = result.scalar_one_or_none()
            if not video:
                _analysis_status[video_id] = "error"
                return

            blogger = video.blogger

            # Step 1: Get transcript
            if not video.transcript:
                from backend.transcriber import get_transcript
                transcript = await get_transcript(video, settings)
                video.transcript = transcript
            else:
                transcript = video.transcript

            # Step 2: Build analysis input
            analysis_input = VideoAnalysisInput(
                platform=video.platform,
                username=blogger.username if blogger else "unknown",
                followers=blogger.followers_count if blogger else 0,
                views=video.views,
                x_factor=video.x_factor,
                likes=video.likes,
                comments=video.comments,
                comment_rate=video.comment_rate,
                duration=video.duration or 0,
                title=video.title or "",
                description=video.description or "",
                transcript=transcript or "",
            )

            # Step 3: AI analysis
            analysis = await ai_router.analyze_video(analysis_input)

            # Step 4: Save
            video.ai_analysis = analysis
            video.is_analyzed = True

            # Also update video's niche/tags if returned by analysis
            if analysis.get("niche"):
                video.niche = analysis["niche"]

            await db.commit()

        _analysis_status[video_id] = "done"
        logger.info("analysis.done", video_id=video_id)

    except Exception as exc:
        _analysis_status[video_id] = "error"
        logger.error("analysis.failed", video_id=video_id, error=str(exc))


@router.post("/videos/{video_id}/analyze", response_model=StatusResponse)
async def trigger_analysis(
    video_id: int,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatusResponse:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    current_status = _analysis_status.get(video_id)
    if current_status == "running":
        return StatusResponse(status="running", message="Анализ уже выполняется")

    _analysis_status[video_id] = "pending"
    background_tasks.add_task(_run_analysis, video_id)

    return StatusResponse(status="started", message="Анализ запущен")


@router.get("/videos/{video_id}/analysis-status", response_model=AnalysisStatusResponse)
async def get_analysis_status(
    video_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalysisStatusResponse:
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    if video.is_analyzed:
        return AnalysisStatusResponse(status="done")

    in_progress = _analysis_status.get(video_id, "pending")
    return AnalysisStatusResponse(status=in_progress)
