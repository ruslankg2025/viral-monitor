"""
Analyze-URL router — core Piratex-like feature.
POST /api/analyze-url            — parse any URL → run full pipeline → return video_id
POST /api/videos/{id}/generate-hooks — generate 5 hook variants
POST /api/videos/{id}/improve    — improve script by action
GET  /api/videos/{id}/full       — full video data with hooks + reel_description
"""
from __future__ import annotations

import re
from typing import Annotated
from urllib.parse import urlparse, parse_qs

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from backend.ai.router import ai_router
from backend.database import get_all_settings_dict, get_db, db_session
from backend.models import Blogger, Video
from backend.parsers.factory import parser_factory
from backend.schemas import (
    AnalyzeUrlRequest,
    AnalyzeUrlResponse,
    HooksResponse,
    HookVariant,
    ImproveRequest,
    ImproveResponse,
    VideoDetailResponse,
    StatusResponse,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["analyze"])


# ── URL detection ─────────────────────────────────────────────────────────────

def detect_platform_and_id(url: str) -> tuple[str, str]:
    """Returns (platform, video_id/username). Raises ValueError if unknown."""
    url = url.strip()
    parsed = urlparse(url)
    host = parsed.netloc.lower().replace("www.", "")
    path = parsed.path

    # YouTube
    if "youtube.com" in host or "youtu.be" in host:
        # youtu.be/ID
        if "youtu.be" in host:
            vid = path.strip("/").split("/")[0].split("?")[0]
            return "youtube", vid
        # /watch?v=ID
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return "youtube", qs["v"][0]
        # /shorts/ID
        m = re.search(r"/shorts/([A-Za-z0-9_-]+)", path)
        if m:
            return "youtube", m.group(1)
        raise ValueError("Не удалось извлечь ID YouTube видео из URL")

    # Instagram
    if "instagram.com" in host:
        m = re.search(r"/(p|reel|tv)/([A-Za-z0-9_-]+)", path)
        if m:
            return "instagram", m.group(2)
        # Profile URL — not a video
        m2 = re.search(r"/([^/]+)/?$", path)
        if m2:
            return "instagram", m2.group(1)
        raise ValueError("Не удалось извлечь ID Instagram видео из URL")

    # TikTok
    if "tiktok.com" in host or "vm.tiktok.com" in host:
        m = re.search(r"/video/(\d+)", path)
        if m:
            return "tiktok", m.group(1)
        # @user/video/ID or short link
        return "tiktok", path.strip("/").split("/")[-1].split("?")[0]

    # VK
    if "vk.com" in host or "vk.ru" in host:
        m = re.search(r"video(-?\d+_\d+)", path + "?" + parsed.query)
        if m:
            return "vk", m.group(1)
        qs = parse_qs(parsed.query)
        if "z" in qs:
            z = qs["z"][0]
            m2 = re.search(r"video(-?\d+_\d+)", z)
            if m2:
                return "vk", m2.group(1)
        raise ValueError("Не удалось извлечь ID VK видео из URL")

    raise ValueError(f"Неизвестная платформа: {host}")


def extract_username_from_url(url: str, platform: str) -> str | None:
    """Try to extract the username/channel from the URL."""
    parsed = urlparse(url)
    path = parsed.path

    if platform == "youtube":
        m = re.search(r"/@([^/]+)", path)
        if m:
            return m.group(1)
        m2 = re.search(r"/channel/([^/]+)", path)
        if m2:
            return m2.group(1)

    elif platform == "instagram":
        m = re.search(r"/([^/]+)/(p|reel|tv)/", path)
        if m:
            return m.group(1)

    elif platform == "tiktok":
        m = re.search(r"/@([^/]+)", path)
        if m:
            return m.group(1)

    return None


# ── Background pipeline ───────────────────────────────────────────────────────

async def _full_pipeline(video_id: int) -> None:
    """Full AI pipeline: transcript → analyze → hooks → reel description → save."""
    try:
        settings = await get_all_settings_dict()

        async with db_session() as db:
            result = await db.execute(
                select(Video).options(selectinload(Video.blogger)).where(Video.id == video_id)
            )
            video = result.scalar_one_or_none()
            if not video:
                return

            blogger = video.blogger

            # Step 1: Transcript
            if not video.transcript:
                from backend.transcriber import get_transcript
                video.transcript = await get_transcript(video, settings)

            transcript = video.transcript or ""

            # Step 2: AI analysis
            from backend.schemas import VideoAnalysisInput
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
                transcript=transcript,
            )
            analysis = await ai_router.analyze_video(analysis_input)
            video.ai_analysis = analysis
            video.is_analyzed = True

            # Step 3: Generate hooks
            hooks_raw = await ai_router.generate_hooks(analysis, transcript)
            video.hooks = hooks_raw

            # Step 4: Reel description
            hook_text = analysis.get("hook", video.title or "")
            key_insight = analysis.get("key_insight", "")
            desc_result = await ai_router.generate_reel_description(
                platform=video.platform,
                hook=hook_text,
                key_insight=key_insight,
            )
            if desc_result.get("description"):
                video.reel_description = desc_result["description"]
                # Merge hashtags into ai_analysis
                if desc_result.get("hashtags"):
                    analysis["reel_hashtags"] = desc_result["hashtags"]
                    video.ai_analysis = analysis

            await db.commit()
            logger.info("analyze.pipeline_done", video_id=video_id)

    except Exception as exc:
        logger.error("analyze.pipeline_failed", video_id=video_id, error=str(exc))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/analyze-url", response_model=AnalyzeUrlResponse)
async def analyze_url(
    body: AnalyzeUrlRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AnalyzeUrlResponse:
    """
    Accept any video URL → detect platform → parse metadata → save to DB
    → run full AI pipeline in background → return video_id for polling.
    """
    try:
        platform, video_id_str = detect_platform_and_id(body.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Check if already in DB
    existing = await db.execute(
        select(Video).where(
            Video.platform == platform,
            Video.external_id == video_id_str,
        )
    )
    existing_video = existing.scalar_one_or_none()
    if existing_video:
        # Re-run pipeline if not analyzed
        if not existing_video.is_analyzed:
            background_tasks.add_task(_full_pipeline, existing_video.id)
        return AnalyzeUrlResponse(
            video_id=existing_video.id,
            status="existing",
            platform=platform,
            message="Видео уже в базе, анализ обновлён",
        )

    settings = await get_all_settings_dict()

    # Find or create a standalone blogger placeholder
    username = extract_username_from_url(body.url, platform) or f"standalone_{platform}"
    username = username.lower().lstrip("@")

    blogger_result = await db.execute(
        select(Blogger).where(
            Blogger.platform == platform,
            Blogger.username == username,
        )
    )
    blogger = blogger_result.scalar_one_or_none()
    if not blogger:
        blogger = Blogger(platform=platform, username=username, is_active=False)
        db.add(blogger)
        await db.flush()

    # Parse video metadata
    try:
        parser = parser_factory.get_parser(platform, settings)

        if platform == "youtube":
            # For YouTube, fetch_videos with direct URL filter
            videos = await parser.fetch_videos(username or video_id_str, limit=1)
            video_data = next((v for v in videos if video_id_str in v.url or video_id_str == v.external_id), None)
            if not video_data:
                # Try direct approach
                from backend.schemas import VideoData
                video_data = VideoData(
                    external_id=video_id_str,
                    url=body.url,
                    platform=platform,
                )
        else:
            # For Instagram/TikTok, use get_video_url or direct parse
            video_data = None
            if hasattr(parser, "fetch_video_by_id"):
                video_data = await parser.fetch_video_by_id(video_id_str)

            if not video_data:
                from backend.schemas import VideoData
                video_data = VideoData(
                    external_id=video_id_str,
                    url=body.url,
                    platform=platform,
                )

    except Exception as exc:
        logger.warning("analyze.parse_failed", url=body.url, error=str(exc))
        from backend.schemas import VideoData
        video_data = VideoData(
            external_id=video_id_str,
            url=body.url,
            platform=platform,
        )

    # Save video
    video = Video(
        blogger_id=blogger.id,
        platform=platform,
        external_id=video_id_str,
        url=body.url,
        title=video_data.title,
        description=video_data.description,
        thumbnail_url=video_data.thumbnail_url,
        views=video_data.views,
        likes=video_data.likes,
        comments=video_data.comments,
        shares=video_data.shares,
        duration=video_data.duration,
        published_at=video_data.published_at,
        is_standalone=True,
        x_factor=1.0,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    # Kick off full AI pipeline
    background_tasks.add_task(_full_pipeline, video.id)

    logger.info("analyze.url_queued", platform=platform, video_id=video.id)
    return AnalyzeUrlResponse(
        video_id=video.id,
        status="new",
        platform=platform,
        message=f"Видео добавлено, анализ запущен",
    )


@router.get("/videos/{video_id}/full", response_model=VideoDetailResponse)
async def get_video_full(
    video_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VideoDetailResponse:
    """Return full video with analysis, hooks, reel description."""
    result = await db.execute(
        select(Video).options(selectinload(Video.blogger)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    blogger = video.blogger
    return VideoDetailResponse(
        id=video.id,
        blogger_id=video.blogger_id,
        platform=video.platform,
        external_id=video.external_id,
        url=video.url,
        title=video.title,
        thumbnail_url=video.thumbnail_url,
        description=video.description,
        transcript=video.transcript,
        views=video.views,
        likes=video.likes,
        comments=video.comments,
        shares=video.shares,
        duration=video.duration,
        published_at=video.published_at,
        fetched_at=video.fetched_at,
        x_factor=video.x_factor,
        is_outlier=video.is_outlier,
        comment_rate=video.comment_rate,
        tags=video.tags,
        niche=video.niche,
        language=video.language,
        is_favorited=video.is_favorited,
        is_analyzed=video.is_analyzed,
        ai_analysis=video.ai_analysis,
        blogger_username=blogger.username if blogger else "",
        blogger_display_name=blogger.display_name if blogger else None,
        blogger_avatar_url=blogger.avatar_url if blogger else None,
        blogger_followers_count=blogger.followers_count if blogger else 0,
        blogger_avg_views=blogger.avg_views if blogger else 0.0,
    )


@router.post("/videos/{video_id}/generate-hooks", response_model=HooksResponse)
async def generate_hooks(
    video_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HooksResponse:
    """Generate 5 hook variants for a video (must be analyzed first)."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    if not video.ai_analysis:
        raise HTTPException(status_code=422, detail="Сначала запустите анализ видео")

    hooks_raw = await ai_router.generate_hooks(video.ai_analysis, video.transcript or "")

    # Save to video
    video.hooks = hooks_raw
    await db.commit()

    # Parse into schema
    hooks = []
    for i, h in enumerate(hooks_raw, 1):
        hooks.append(HookVariant(
            number=h.get("number", i),
            text=h.get("text", ""),
            technique=h.get("technique", ""),
            mechanism=h.get("mechanism", ""),
            rating=h.get("rating", "Альтернатива"),
            timing=h.get("timing", "0-3 сек"),
        ))

    return HooksResponse(video_id=video_id, hooks=hooks)


@router.post("/videos/{video_id}/improve", response_model=ImproveResponse)
async def improve_script(
    video_id: int,
    body: ImproveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImproveResponse:
    """Improve a script text by action command."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=404, detail="Видео не найдено")

    result = await ai_router.improve_script(
        action=body.action,
        current_text=body.current_text,
        custom_prompt=body.custom_prompt,
    )

    return ImproveResponse(
        improved_text=result.get("improved_text", body.current_text),
        changes_made=result.get("changes_made", ""),
    )


@router.get("/my-videos", response_model=dict)
async def get_my_videos(
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str = "all",   # all | analyzing | done | error
    page: int = 1,
    limit: int = 20,
) -> dict:
    """Return standalone analyzed videos (history)."""
    from sqlalchemy import desc

    query = select(Video).options(selectinload(Video.blogger)).where(Video.is_standalone == True)  # noqa: E712

    if status == "done":
        query = query.where(Video.is_analyzed == True)  # noqa: E712
    elif status == "analyzing":
        query = query.where(Video.is_analyzed == False)  # noqa: E712

    total_result = await db.execute(
        select(Video).where(Video.is_standalone == True)  # noqa: E712
    )
    total = len(total_result.scalars().all())

    query = query.order_by(desc(Video.fetched_at)).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    videos = result.scalars().all()

    items = []
    for v in videos:
        blogger = v.blogger
        items.append({
            "id": v.id,
            "platform": v.platform,
            "url": v.url,
            "title": v.title,
            "thumbnail_url": v.thumbnail_url,
            "views": v.views,
            "likes": v.likes,
            "comments": v.comments,
            "duration": v.duration,
            "published_at": v.published_at.isoformat() if v.published_at else None,
            "fetched_at": v.fetched_at.isoformat(),
            "is_analyzed": v.is_analyzed,
            "is_favorited": v.is_favorited,
            "comment_rate": v.comment_rate,
            "niche": v.niche,
            "hook": v.ai_analysis.get("hook") if v.ai_analysis else None,
            "blogger_username": blogger.username if blogger else "",
        })

    return {"items": items, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}
