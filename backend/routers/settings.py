"""
Settings router.
GET  /api/settings                   — all settings
PUT  /api/settings                   — batch update
POST /api/settings/validate          — validate a single API key (live test)
GET  /api/settings/providers-status  — status of all providers
POST /api/refresh/all                — trigger refresh for all bloggers
POST /api/recalculate                — recalculate all X-factors
GET  /api/stats                      — dashboard stats
GET  /api/costs                      — API usage costs
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

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


class ValidateKeyRequest(BaseModel):
    provider: str  # claude | openai | groq | assemblyai | apify
    api_key: str


class ValidateKeyResponse(BaseModel):
    provider: str
    ok: bool
    message: str


class ProviderStatus(BaseModel):
    provider: str
    label: str
    configured: bool
    ok: bool | None = None   # None = not tested yet
    message: str = ""


class ProvidersStatusResponse(BaseModel):
    providers: list[ProviderStatus]
    any_ai_ready: bool

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


# ── API Key validation ────────────────────────────────────────────────────────

@router.post("/settings/validate", response_model=ValidateKeyResponse)
async def validate_api_key(body: ValidateKeyRequest) -> ValidateKeyResponse:
    """Send a minimal real request to verify the API key works."""
    key = body.api_key.strip()
    provider = body.provider.lower()

    if not key:
        return ValidateKeyResponse(provider=provider, ok=False, message="Ключ не может быть пустым")

    try:
        if provider == "claude":
            result = await _validate_claude(key)
        elif provider == "openai":
            result = await _validate_openai(key)
        elif provider == "groq":
            result = await _validate_groq(key)
        elif provider == "assemblyai":
            result = await _validate_assemblyai(key)
        elif provider == "apify":
            result = await _validate_apify(key)
        else:
            return ValidateKeyResponse(provider=provider, ok=False, message=f"Неизвестный провайдер: {provider}")
    except Exception as exc:
        return ValidateKeyResponse(provider=provider, ok=False, message=str(exc)[:200])

    return ValidateKeyResponse(provider=provider, **result)


async def _validate_claude(key: str) -> dict:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=key)
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=10,
        messages=[{"role": "user", "content": "hi"}],
    )
    return {"ok": True, "message": f"Работает ✓ (модель: {msg.model})"}


async def _validate_openai(key: str) -> dict:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=key)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=5,
        messages=[{"role": "user", "content": "hi"}],
    )
    return {"ok": True, "message": f"Работает ✓ (модель: {resp.model})"}


async def _validate_groq(key: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"model": "llama-3.3-70b-versatile", "max_tokens": 5,
                  "messages": [{"role": "user", "content": "hi"}]},
        )
        if resp.status_code == 401:
            return {"ok": False, "message": "Неверный ключ (401)"}
        resp.raise_for_status()
    return {"ok": True, "message": "Работает ✓ (Llama 3.3 70B, бесплатно)"}


async def _validate_assemblyai(key: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.assemblyai.com/v2/transcript",
            headers={"authorization": key},
            params={"limit": 1},
        )
        if resp.status_code == 401:
            return {"ok": False, "message": "Неверный ключ (401)"}
        resp.raise_for_status()
    return {"ok": True, "message": "Работает ✓ (~$0.006 за 60 сек аудио)"}


async def _validate_apify(key: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.apify.com/v2/users/me",
            headers={"Authorization": f"Bearer {key}"},
        )
        if resp.status_code == 401:
            return {"ok": False, "message": "Неверный ключ (401)"}
        resp.raise_for_status()
        data = resp.json().get("data", {})
        plan = data.get("plan", {}).get("id", "free")
    return {"ok": True, "message": f"Работает ✓ (план: {plan})"}


# ── Providers status ──────────────────────────────────────────────────────────

@router.get("/settings/providers-status", response_model=ProvidersStatusResponse)
async def get_providers_status(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProvidersStatusResponse:
    """Return which providers are configured (key set), without live-testing."""
    result = await db.execute(select(Setting))
    settings = {row.key: row.value for row in result.scalars().all()}

    PROVIDERS = [
        ("claude",      "Claude (Anthropic)",  "anthropic_api_key"),
        ("openai",      "OpenAI",              "openai_api_key"),
        ("groq",        "Groq / Llama",        "groq_api_key"),
        ("assemblyai",  "AssemblyAI",          "assemblyai_api_key"),
        ("apify",       "Apify",               "apify_api_key"),
        ("vk",          "VK API",              "vk_access_token"),
    ]

    providers = [
        ProviderStatus(
            provider=pid,
            label=label,
            configured=bool(settings.get(key, "").strip()),
        )
        for pid, label, key in PROVIDERS
    ]

    any_ai_ready = any(
        p.configured for p in providers if p.provider in ("claude", "openai", "groq")
    )

    return ProvidersStatusResponse(providers=providers, any_ai_ready=any_ai_ready)
