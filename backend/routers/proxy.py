"""
Image proxy endpoint — fetches remote images (e.g. Instagram CDN) and
returns them to the browser, bypassing CORS restrictions.

GET /api/proxy/image?url=<encoded_url>
"""
from __future__ import annotations

import hashlib

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["proxy"])

# Allowed CDN domains (security: never proxy arbitrary URLs)
_ALLOWED_HOSTS = {
    "instagram.com",
    "cdninstagram.com",
    "fbcdn.net",
    "scontent.cdninstagram.com",
    "lookaside.fbsbx.com",
    "youtube.com",
    "ytimg.com",
    "i.ytimg.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
    "vk.com",
    "sun9-1.userapi.com",
    "sun1-1.userapi.com",
}

_client = httpx.AsyncClient(
    timeout=10,
    follow_redirects=True,
    headers={
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    },
)


def _is_allowed(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname or ""
        return any(host == d or host.endswith("." + d) for d in _ALLOWED_HOSTS)
    except Exception:
        return False


@router.get("/proxy/image")
async def proxy_image(url: str = Query(..., description="Remote image URL to fetch")) -> Response:
    if not _is_allowed(url):
        raise HTTPException(status_code=403, detail="URL not allowed")

    try:
        resp = await _client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Upstream {resp.status_code}")

        content_type = resp.headers.get("content-type", "image/jpeg")
        return Response(
            content=resp.content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=86400",  # cache 24h in browser
                "X-Content-Type-Options": "nosniff",
            },
        )
    except httpx.RequestError as exc:
        logger.warning("proxy.image_fetch_failed", url=url[:80], error=str(exc))
        raise HTTPException(status_code=502, detail="Failed to fetch image")
