"""
Internal Pydantic models for AI responses and routing.
"""
from __future__ import annotations

from pydantic import BaseModel


class AIResponse(BaseModel):
    """Unified response from any AI provider."""
    text: str
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float = 0.0
    duration_ms: int = 0
    provider: str = ""
    model: str = ""


class CategorizationResult(BaseModel):
    niche: str = "общее"
    tags: list[str] = []
    language: str = "ru"


class VideoAnalysisResult(BaseModel):
    hook: str = ""
    hook_type: str = ""
    structure: list[dict] = []
    why_viral: list[str] = []
    emotion_trigger: str = ""
    cta: str | None = None
    format: str = ""
    reusable_techniques: list[str] = []
    niche: str = ""
    difficulty_to_replicate: str = "средне"
    key_insight: str = ""


class ScriptScene(BaseModel):
    time: str = ""
    text: str = ""
    visual: str = ""
    technique: str = ""


class GeneratedScript(BaseModel):
    variant: int = 1
    title: str = ""
    hook: str = ""
    hook_visual: str = ""
    scenes: list[ScriptScene] = []
    cta: str = ""
    hashtags: list[str] = []
    shooting_tips: str = ""
    estimated_duration: str = ""
