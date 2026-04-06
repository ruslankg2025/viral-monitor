"""
Token-based auth dependency.
Every request to protected routes must include X-Account-Token header.
"""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import Account

logger = structlog.get_logger(__name__)


async def get_current_account(
    db: Annotated[AsyncSession, Depends(get_db)],
    x_account_token: str | None = Header(default=None),
) -> Account:
    if not x_account_token:
        raise HTTPException(status_code=401, detail="Требуется токен аккаунта")
    result = await db.execute(select(Account).where(Account.token == x_account_token))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=401, detail="Неверный токен")
    return account


CurrentAccount = Annotated[Account, Depends(get_current_account)]
