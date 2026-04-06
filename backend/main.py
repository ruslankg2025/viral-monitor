"""
FastAPI application entry point.
- CORS for Vite dev server (localhost:5173)
- Lifespan: DB init → seed settings → start scheduler
- All routers mounted under /api
- Structured JSON logging via structlog
"""
from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Logging setup (must happen before any imports that use structlog) ──────────

def _configure_logging() -> None:
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer() if sys.stderr.isatty()
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configure_logging()
logger = structlog.get_logger(__name__)


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("startup.begin")

    # 1. Initialise DB (create tables + seed settings)
    from backend.database import init_db
    await init_db()

    # 2. Start background scheduler
    from backend.scheduler import start_scheduler, stop_scheduler
    await start_scheduler()

    logger.info("startup.complete")
    yield

    # Teardown
    await stop_scheduler()
    logger.info("shutdown.complete")


# ── Application ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Viral Monitor",
    description="Local viral video monitoring and script generation tool",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global exception handler ───────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_exception", exc_info=exc, path=str(request.url))
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера"},
    )


# ── Routers ────────────────────────────────────────────────────────────────────

from backend.routers.bloggers import router as bloggers_router
from backend.routers.videos import router as videos_router
from backend.routers.analysis import router as analysis_router
from backend.routers.scripts import router as scripts_router
from backend.routers.settings import router as settings_router
from backend.routers.analyze import router as analyze_router

app.include_router(bloggers_router, prefix="/api")
app.include_router(videos_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(scripts_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(analyze_router, prefix="/api")


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info",
    )
