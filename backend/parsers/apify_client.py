"""
Shared Apify client wrapper.
Uses the official apify-client Python SDK.
"""
from __future__ import annotations

import time
from typing import Any

import structlog
from apify_client import ApifyClient

from backend.database import db_session
from backend.models import APIUsageLog

logger = structlog.get_logger(__name__)


class ApifyActorClient:
    """Thin wrapper around ApifyClient with cost logging and error handling."""

    def __init__(self, api_key: str) -> None:
        self._client = ApifyClient(api_key)
        self._api_key = api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def run_actor(
        self,
        actor_id: str,
        run_input: dict[str, Any],
        timeout_secs: int = 120,
    ) -> list[dict[str, Any]]:
        """
        Run an Apify actor synchronously (blocking the event loop via executor),
        collect results, log cost.
        Returns list of result items or empty list on failure.
        """
        import asyncio
        loop = asyncio.get_event_loop()
        start = time.monotonic()
        try:
            items = await loop.run_in_executor(
                None,
                lambda: self._run_actor_sync(actor_id, run_input, timeout_secs),
            )
            duration_ms = int((time.monotonic() - start) * 1000)
            await self._log_usage(actor_id, duration_ms, success=True, item_count=len(items))
            return items
        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            await self._log_usage(
                actor_id, duration_ms, success=False, error=str(exc)
            )
            logger.error("apify.actor_failed", actor=actor_id, error=str(exc))
            return []

    def _run_actor_sync(
        self,
        actor_id: str,
        run_input: dict[str, Any],
        timeout_secs: int,
    ) -> list[dict[str, Any]]:
        """Synchronous actor execution (called in executor)."""
        run = self._client.actor(actor_id).call(
            run_input=run_input,
            timeout_secs=timeout_secs,
        )
        if not run or run.get("status") == "FAILED":
            raise RuntimeError(
                f"Actor {actor_id} failed with status: {run.get('status') if run else 'None'}"
            )

        dataset_id = run.get("defaultDatasetId")
        if not dataset_id:
            return []

        items = list(
            self._client.dataset(dataset_id).iterate_items()
        )
        return items

    async def _log_usage(
        self,
        actor_id: str,
        duration_ms: int,
        success: bool,
        item_count: int = 0,
        error: str | None = None,
    ) -> None:
        try:
            async with db_session() as session:
                log = APIUsageLog(
                    provider="apify",
                    operation=f"actor:{actor_id}",
                    tokens_in=0,
                    tokens_out=0,
                    cost_usd=0.0,  # Apify costs tracked separately on their dashboard
                    duration_ms=duration_ms,
                    success=success,
                    error_message=error,
                )
                session.add(log)
                await session.commit()
        except Exception as log_exc:
            logger.warning("apify.log_failed", error=str(log_exc))
