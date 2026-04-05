"""
Shared AI utilities: JSON parsing, markdown stripping.
"""
from __future__ import annotations

import json
import re


def strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers."""
    text = text.strip()
    # Remove leading fence
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    # Remove trailing fence
    text = re.sub(r"\n?```\s*$", "", text, flags=re.IGNORECASE)
    return text.strip()


def parse_ai_json(raw: str) -> dict | list:
    """
    Robustly parse JSON from an AI response.
    Steps:
    1. Strip markdown code fences
    2. Try json.loads directly
    3. Regex-extract first { ... } or [ ... ] block
    4. Raise ValueError with context on failure
    """
    clean = strip_markdown_fences(raw)

    # Attempt 1: direct parse
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    # Attempt 2: extract first JSON object
    match = re.search(r"\{[\s\S]*\}", clean)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    # Attempt 3: extract first JSON array
    match = re.search(r"\[[\s\S]*\]", clean)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    preview = raw[:200].replace("\n", " ")
    raise ValueError(f"Не удалось распарсить JSON от AI. Начало ответа: {preview!r}")
