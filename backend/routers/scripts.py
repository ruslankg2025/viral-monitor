"""
Scripts router.
GET  /api/scripts              — list with filters
POST /api/scripts/generate     — generate via AI
GET  /api/scripts/{id}         — detail
PUT  /api/scripts/{id}         — update
DELETE /api/scripts/{id}       — delete
"""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.ai.router import ai_router
from backend.database import get_db
from backend.models import Script, Video
from backend.schemas import (
    GenerateScriptRequest,
    OkResponse,
    ScriptDetailResponse,
    ScriptResponse,
    ScriptsPage,
    ScriptUpdate,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["scripts"])


def _script_to_response(script: Script) -> ScriptResponse:
    return ScriptResponse.model_validate(script)


def _script_to_detail(script: Script) -> ScriptDetailResponse:
    return ScriptDetailResponse.model_validate(script)


@router.get("/scripts", response_model=ScriptsPage)
async def list_scripts(
    db: Annotated[AsyncSession, Depends(get_db)],
    platform: str | None = Query(None),
    niche: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> ScriptsPage:
    stmt = select(Script)

    if platform:
        stmt = stmt.where(Script.platform_target == platform.lower())
    if niche:
        stmt = stmt.where(Script.niche == niche)

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar_one()

    stmt = stmt.order_by(desc(Script.created_at)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    scripts = result.scalars().all()

    return ScriptsPage(
        items=[_script_to_response(s) for s in scripts],
        total=total,
    )


@router.post("/scripts/generate", response_model=list[ScriptResponse], status_code=201)
async def generate_scripts(
    params: GenerateScriptRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScriptResponse]:
    # Load AI analysis from linked video if provided
    ai_analysis = None
    video_niche = None
    if params.video_id:
        result = await db.execute(select(Video).where(Video.id == params.video_id))
        video = result.scalar_one_or_none()
        if video:
            ai_analysis = video.ai_analysis
            video_niche = video.niche

    try:
        raw_scripts = await ai_router.generate_scripts(params, ai_analysis=ai_analysis)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ошибка генерации: {exc}")

    saved: list[Script] = []
    for raw in raw_scripts:
        scenes = raw.get("scenes", [])
        # Build full_text from scenes
        full_text_parts = []
        if raw.get("hook"):
            full_text_parts.append(raw["hook"])
        for scene in scenes:
            if scene.get("text"):
                full_text_parts.append(scene["text"])
        if raw.get("cta"):
            full_text_parts.append(raw["cta"])

        script = Script(
            video_id=params.video_id,
            title=raw.get("title") or f"Сценарий — {params.topic[:50]}",
            hook=raw.get("hook"),
            hook_visual=raw.get("hook_visual"),
            structure=scenes,
            full_text="\n\n".join(full_text_parts),
            niche=video_niche or ai_analysis.get("niche") if ai_analysis else None,
            platform_target=params.platform,
            style=params.style,
            duration_target=params.duration,
            hashtags=raw.get("hashtags", []),
            shooting_tips=raw.get("shooting_tips"),
        )
        db.add(script)
        saved.append(script)

    await db.commit()
    for s in saved:
        await db.refresh(s)

    logger.info("scripts.generated", count=len(saved), video_id=params.video_id)
    return [_script_to_response(s) for s in saved]


@router.get("/scripts/{script_id}", response_model=ScriptDetailResponse)
async def get_script(
    script_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScriptDetailResponse:
    result = await db.execute(select(Script).where(Script.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    return _script_to_detail(script)


@router.put("/scripts/{script_id}", response_model=ScriptDetailResponse)
async def update_script(
    script_id: int,
    body: ScriptUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScriptDetailResponse:
    result = await db.execute(select(Script).where(Script.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Сценарий не найден")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(script, field, value)

    await db.commit()
    await db.refresh(script)
    return _script_to_detail(script)


@router.delete("/scripts/{script_id}", response_model=OkResponse)
async def delete_script(
    script_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OkResponse:
    result = await db.execute(select(Script).where(Script.id == script_id))
    script = result.scalar_one_or_none()
    if not script:
        raise HTTPException(status_code=404, detail="Сценарий не найден")

    await db.delete(script)
    await db.commit()
    return OkResponse()
