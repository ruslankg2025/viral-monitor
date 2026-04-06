"""
Accounts router.
GET    /api/accounts                              — list all (admin)
POST   /api/accounts                              — create account (admin)
GET    /api/accounts/me                           — get current account + profiles
DELETE /api/accounts/{id}                         — delete account (admin)

GET    /api/accounts/me/main-profiles             — list main profiles
POST   /api/accounts/me/main-profiles             — add main profile
DELETE /api/accounts/me/main-profiles/{id}        — remove main profile
POST   /api/accounts/me/main-profiles/{id}/settings — update generation settings
POST   /api/accounts/me/main-profiles/{id}/login  — login via instagrapi

GET    /api/accounts/me/scraper-profiles          — list scraper profiles
POST   /api/accounts/me/scraper-profiles          — add scraper profile
DELETE /api/accounts/me/scraper-profiles/{id}     — remove scraper profile
POST   /api/accounts/me/scraper-profiles/{id}/login — login scraper account
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import CurrentAccount
from backend.config import get_settings
from backend.database import get_db
from backend.models import Account, MainProfile, ScraperProfile

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["accounts"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class AccountResponse(BaseModel):
    id: int
    display_name: str | None
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    display_name: str | None = None
    is_admin: bool = False


class MainProfileResponse(BaseModel):
    id: int
    account_id: int
    platform: str
    username: str
    display_name: str | None
    avatar_url: str | None
    followers_count: int
    status: str
    niche: str | None
    tone: str | None
    tone_custom: str | None
    video_format: str | None
    video_format_custom: str | None
    audience_desc: str | None
    banned_words: str | None
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountMeResponse(BaseModel):
    id: int
    display_name: str | None
    is_admin: bool
    created_at: datetime
    main_profiles: list[MainProfileResponse]
    scraper_profiles: list["ScraperProfileResponse"]

    model_config = {"from_attributes": True}


class ScraperProfileResponse(BaseModel):
    id: int
    account_id: int
    platform: str
    username: str
    status: str
    last_login_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


AccountMeResponse.model_rebuild()


class MainProfileCreate(BaseModel):
    platform: str  # instagram | tiktok
    username: str


class MainProfileSettings(BaseModel):
    niche: str | None = None
    tone: str | None = None
    tone_custom: str | None = None
    video_format: str | None = None
    video_format_custom: str | None = None
    audience_desc: str | None = None
    banned_words: str | None = None


class LoginCreds(BaseModel):
    username: str
    password: str | None = None
    session_cookie: str | None = None  # sessionid cookie as alternative to password


class ScraperProfileCreate(BaseModel):
    platform: str  # instagram | tiktok
    username: str
    password: str | None = None


# ── Admin dependency ──────────────────────────────────────────────────────────

def _check_admin(x_admin_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Требуется ключ администратора")


AdminRequired = Depends(_check_admin)


# ── Instagram login helper ────────────────────────────────────────────────────

async def _instagram_login(
    username: str,
    password: str | None = None,
    session_cookie: str | None = None,
) -> tuple[str, dict]:
    """Login to Instagram, return (session_json, profile_data).
    Supports username+password OR sessionid cookie (bypass IP block)."""
    import asyncio
    from urllib.parse import unquote

    def _sync_login():
        from instagrapi import Client
        cl = Client()
        cl.delay_range = [1, 3]

        if session_cookie:
            # Use sessionid cookie directly — works even if IP is rate-limited
            sid = unquote(session_cookie.strip())
            cl.login_by_sessionid(sid)
        elif password:
            cl.login(username, password)
        else:
            raise ValueError("Нужен пароль или session cookie")

        session = cl.get_settings()
        try:
            user_info = cl.account_info()
            profile = {
                "display_name": user_info.full_name,
                "avatar_url": str(user_info.profile_pic_url) if user_info.profile_pic_url else None,
                "followers_count": user_info.follower_count,
            }
        except Exception:
            profile = {"display_name": None, "avatar_url": None, "followers_count": 0}
        return json.dumps(session), profile

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync_login)


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: None = AdminRequired,
) -> list[AccountResponse]:
    result = await db.execute(select(Account).order_by(Account.created_at))
    accounts = result.scalars().all()
    return [AccountResponse.model_validate(a) for a in accounts]


@router.post("/accounts", response_model=AccountResponse, status_code=201)
async def create_account(
    body: AccountCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: None = AdminRequired,
) -> AccountResponse:
    token = secrets.token_hex(32)
    account = Account(
        token=token,
        display_name=body.display_name,
        is_admin=body.is_admin,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    logger.info("accounts.created", account_id=account.id, token=token)
    return AccountResponse.model_validate(account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: None = AdminRequired,
) -> dict:
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    await db.delete(account)
    await db.commit()
    logger.info("accounts.deleted", account_id=account_id)
    return {"ok": True}


# ── Me endpoint ───────────────────────────────────────────────────────────────

@router.get("/accounts/me", response_model=AccountMeResponse)
async def get_me(
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountMeResponse:
    main_result = await db.execute(
        select(MainProfile).where(MainProfile.account_id == account.id)
    )
    main_profiles = main_result.scalars().all()

    scraper_result = await db.execute(
        select(ScraperProfile).where(ScraperProfile.account_id == account.id)
    )
    scraper_profiles = scraper_result.scalars().all()

    return AccountMeResponse(
        id=account.id,
        display_name=account.display_name,
        is_admin=account.is_admin,
        created_at=account.created_at,
        main_profiles=[MainProfileResponse.model_validate(p) for p in main_profiles],
        scraper_profiles=[ScraperProfileResponse.model_validate(p) for p in scraper_profiles],
    )


# ── Main profiles ─────────────────────────────────────────────────────────────

@router.get("/accounts/me/main-profiles", response_model=list[MainProfileResponse])
async def list_main_profiles(
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MainProfileResponse]:
    result = await db.execute(
        select(MainProfile).where(MainProfile.account_id == account.id)
    )
    profiles = result.scalars().all()
    return [MainProfileResponse.model_validate(p) for p in profiles]


@router.post("/accounts/me/main-profiles", response_model=MainProfileResponse, status_code=201)
async def add_main_profile(
    body: MainProfileCreate,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MainProfileResponse:
    profile = MainProfile(
        account_id=account.id,
        platform=body.platform.lower(),
        username=body.username.lstrip("@"),
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    logger.info("accounts.main_profile_added", account_id=account.id, platform=body.platform)
    return MainProfileResponse.model_validate(profile)


@router.delete("/accounts/me/main-profiles/{profile_id}")
async def delete_main_profile(
    profile_id: int,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    result = await db.execute(
        select(MainProfile).where(
            MainProfile.id == profile_id,
            MainProfile.account_id == account.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    await db.delete(profile)
    await db.commit()
    return {"ok": True}


@router.post("/accounts/me/main-profiles/{profile_id}/settings", response_model=MainProfileResponse)
async def update_main_profile_settings(
    profile_id: int,
    body: MainProfileSettings,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MainProfileResponse:
    result = await db.execute(
        select(MainProfile).where(
            MainProfile.id == profile_id,
            MainProfile.account_id == account.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    logger.info("accounts.main_profile_settings_updated", profile_id=profile_id)
    return MainProfileResponse.model_validate(profile)


@router.post("/accounts/me/main-profiles/{profile_id}/login", response_model=MainProfileResponse)
async def login_main_profile(
    profile_id: int,
    body: LoginCreds,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MainProfileResponse:
    result = await db.execute(
        select(MainProfile).where(
            MainProfile.id == profile_id,
            MainProfile.account_id == account.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    if profile.platform != "instagram":
        raise HTTPException(status_code=400, detail="Логин поддерживается только для Instagram")

    try:
        session_json, profile_data = await _instagram_login(body.username, body.password, body.session_cookie)
        profile.session_json = session_json
        profile.username = body.username
        profile.display_name = profile_data.get("display_name")
        profile.avatar_url = profile_data.get("avatar_url")
        profile.followers_count = profile_data.get("followers_count", 0)
        profile.status = "active"
        profile.last_login_at = datetime.utcnow()
        await db.commit()
        await db.refresh(profile)
        logger.info("accounts.main_profile_login_success", profile_id=profile_id)
        return MainProfileResponse.model_validate(profile)
    except Exception as exc:
        logger.error("accounts.main_profile_login_failed", profile_id=profile_id, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Ошибка входа: {exc}")


# ── Scraper profiles ──────────────────────────────────────────────────────────

@router.get("/accounts/me/scraper-profiles", response_model=list[ScraperProfileResponse])
async def list_scraper_profiles(
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ScraperProfileResponse]:
    result = await db.execute(
        select(ScraperProfile).where(ScraperProfile.account_id == account.id)
    )
    profiles = result.scalars().all()
    return [ScraperProfileResponse.model_validate(p) for p in profiles]


@router.post("/accounts/me/scraper-profiles", response_model=ScraperProfileResponse, status_code=201)
async def add_scraper_profile(
    body: ScraperProfileCreate,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScraperProfileResponse:
    profile = ScraperProfile(
        account_id=account.id,
        platform=body.platform.lower(),
        username=body.username.lstrip("@"),
        password=body.password,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    logger.info("accounts.scraper_profile_added", account_id=account.id, platform=body.platform)
    return ScraperProfileResponse.model_validate(profile)


@router.delete("/accounts/me/scraper-profiles/{profile_id}")
async def delete_scraper_profile(
    profile_id: int,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    result = await db.execute(
        select(ScraperProfile).where(
            ScraperProfile.id == profile_id,
            ScraperProfile.account_id == account.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    await db.delete(profile)
    await db.commit()
    return {"ok": True}


@router.post(
    "/accounts/me/scraper-profiles/{profile_id}/login",
    response_model=ScraperProfileResponse,
)
async def login_scraper_profile(
    profile_id: int,
    body: LoginCreds,
    account: CurrentAccount,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScraperProfileResponse:
    result = await db.execute(
        select(ScraperProfile).where(
            ScraperProfile.id == profile_id,
            ScraperProfile.account_id == account.id,
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    if profile.platform != "instagram":
        raise HTTPException(status_code=400, detail="Логин поддерживается только для Instagram")

    try:
        session_json, _ = await _instagram_login(body.username, body.password, body.session_cookie)
        profile.session_json = session_json
        profile.username = body.username
        if body.password:
            profile.password = body.password
        profile.status = "active"
        profile.last_login_at = datetime.utcnow()
        await db.commit()
        await db.refresh(profile)
        logger.info("accounts.scraper_profile_login_success", profile_id=profile_id)
        return ScraperProfileResponse.model_validate(profile)
    except Exception as exc:
        logger.error("accounts.scraper_profile_login_failed", profile_id=profile_id, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Ошибка входа: {exc}")
