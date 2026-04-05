"""
Settings router.
GET  /api/settings          — all settings
PUT  /api/settings          — batch update
POST /api/refresh/all       — trigger refresh for all bloggers
POST /api/recalculate       — recalculate all X-factors
GET  /api/stats             — dashboard stats
GET  /api/costs             — API usage costs
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.analyzer import recalculate_all_x_factors, update_blogger_stats
from backend.database import get_all_settings_dict, get_db
from backend.models import APIUsageLog, Blogger, Script, Setting, Video
from backend.schemas import (
    AppStats,
    CostsResponse,
    OkResponse,
    ProviderCost,
    RecalcResponse,
    SettingsUpdate,
    StatusResponse,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["settings"])


@router.get("/settings")
async def get_settings(db: Annotated[AsyncSession, Depends(get_db)]) -> dict[str, str]:
    result = await db.execute(select(Setting))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


@router.put("/settings")
async def update_settings(
    body: SettingsUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    for key, value in body.updates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        if setting is not None:
            setting.value = str(value)
        else:
            db.add(Setting(key=key, value=str(value)))

    await db.commit()
    logger.info("settings.updated", keys=list(body.updates.keys()))
    return await get_settings(db)


@router.post("/refresh/all", response_model=StatusResponse)
async def refresh_all_bloggers(
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StatusResponse:
    result = await db.execute(
        select(Blogger).where(Blogger.is_active == True)  # noqa: E712
    )
    bloggers = result.scalars().all()

    from backend.routers.bloggers import _background_fetch
    for blogger in bloggers:
        background_tasks.add_task(_background_fetch, blogger.id)

    logger.info("settings.refresh_all", count=len(bloggers))
    return StatusResponse(
        status="started",
        message=f"Обновление {len(bloggers)} блогеров запущено",
    )


@router.post("/recalculate", response_model=RecalcResponse)
async def recalculate_xfactors(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecalcResponse:
    settings = await get_all_settings_dict()
    threshold = float(settings.get("outlier_threshold", "3.0"))

    bloggers_result = await db.execute(select(Blogger))
    bloggers = bloggers_result.scalars().all()

    total_updated = 0
    for blogger in bloggers:
        await update_blogger_stats(db, blogger.id)
        updated = await recalculate_all_x_factors(db, blogger.id, threshold)
        total_updated += updated

    logger.info("settings.recalculated", total=total_updated)
    return RecalcResponse(updated=total_updated)


@router.get("/stats", response_model=AppStats)
async def get_stats(db: Annotated[AsyncSession, Depends(get_db)]) -> AppStats:
    total_bloggers = (await db.execute(select(func.count(Blogger.id)))).scalar_one()
    active_bloggers = (
        await db.execute(
            select(func.count(Blogger.id)).where(Blogger.is_active == True)  # noqa: E712
        )
    ).scalar_one()
    total_videos = (await db.execute(select(func.count(Video.id)))).scalar_one()
    outlier_videos = (
        await db.execute(
            select(func.count(Video.id)).where(Video.is_outlier == True)  # noqa: E712
        )
    ).scalar_one()
    total_scripts = (await db.execute(select(func.count(Script.id)))).scalar_one()

    # Last refresh = latest last_checked_at
    last_refresh_result = await db.execute(
        select(Blogger.last_checked_at)
        .where(Blogger.last_checked_at != None)  # noqa: E711
        .order_by(desc(Blogger.last_checked_at))
        .limit(1)
    )
    last_refresh = last_refresh_result.scalar_one_or_none()

    return AppStats(
        total_bloggers=total_bloggers,
        active_bloggers=active_bloggers,
        total_videos=total_videos,
        outlier_videos=outlier_videos,
        total_scripts=total_scripts,
        last_refresh=last_refresh,
    )


@router.get("/costs", response_model=CostsResponse)
async def get_costs(
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = "month",
) -> CostsResponse:
    if period == "week":
        cutoff = datetime.utcnow() - timedelta(days=7)
    else:
        cutoff = datetime.utcnow() - timedelta(days=30)

    result = await db.execute(
        select(
            APIUsageLog.provider,
            func.count(APIUsageLog.id).label("requests"),
            func.sum(APIUsageLog.tokens_in).label("tokens_in"),
            func.sum(APIUsageLog.tokens_out).label("tokens_out"),
            func.sum(APIUsageLog.cost_usd).label("total_cost"),
        )
        .where(APIUsageLog.created_at >= cutoff)
        .group_by(APIUsageLog.provider)
        .order_by(desc(func.sum(APIUsageLog.cost_usd)))
    )
    rows = result.fetchall()

    by_provider = [
        ProviderCost(
            provider=row.provider,
            requests=row.requests,
            tokens_in=int(row.tokens_in or 0),
            tokens_out=int(row.tokens_out or 0),
            cost_usd=round(float(row.total_cost or 0), 4),
        )
        for row in rows
    ]
    total = round(sum(p.cost_usd for p in by_provider), 4)

    return CostsResponse(
        by_provider=by_provider,
        total_cost=total,
        period=period,
    )


@router.delete("/costs/clear", response_model=OkResponse)
async def clear_cost_logs(db: Annotated[AsyncSession, Depends(get_db)]) -> OkResponse:
    """Clear all API usage logs."""
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(APIUsageLog))
    await db.commit()
    logger.info("settings.costs_cleared")
    return OkResponse()
