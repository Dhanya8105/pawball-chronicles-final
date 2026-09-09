"""
services/ai/app/services/vision_cv.py

Claude Vision as the CV pipeline. Sends the capture image to the Anthropic
Messages API (claude-sonnet-4-6, vision) with a strict JSON-only system
prompt, then maps the reply onto `CvAnalysisResult`. No local model
weights, no PyTorch — the whole "download_models.sh" step is gone.

If `ANTHROPIC_API_KEY` is unset the service returns a clearly-labelled mock
result (`mock=True`, `confidence=0.0`) so the capture → bond → lore
pipeline still runs end-to-end in local dev without a key.
"""

import base64
import json
import os
from typing import Any

from app.schemas.cv_result import (
    CoatResult,
    ConfidenceValue,
    CvAnalysisResult,
    SurroundingLabel,
)

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are a computer vision API for a cat collection game.
Analyze the image and return ONLY valid JSON matching this schema:
{ isCat, confidence, breed{label,confidence}, pose{label,confidence},
  faceOrientation{label,confidence}, eyeOpenness{label,confidence},
  earOrientation{label,confidence}, tailVisible, coat{color,pattern,confidence},
  estimatedAgeGroup{label,confidence}, surroundings[{label,confidence}] }
pose label must be one of: sitting|sleeping|running|loaf|standing|unknown
eyeOpenness label must be one of: open|half|closed
earOrientation label must be one of: forward|alert|relaxed|flat
estimatedAgeGroup label must be one of: kitten|adult|senior
surroundings: up to 4 environment descriptors visible in the image.
If no cat is present return isCat:false with confidence and nulls elsewhere.
No markdown. No explanation. Raw JSON only."""


def has_api_key() -> bool:
    return bool(os.getenv("ANTHROPIC_API_KEY"))


def image_source_from_bytes(image_bytes: bytes, media_type: str) -> dict:
    return {
        "type": "base64",
        "media_type": media_type,
        "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
    }


def image_source_from_url(url: str) -> dict:
    return {"type": "url", "url": url}


async def analyze_image_source(image_source: dict) -> CvAnalysisResult:
    """image_source is an Anthropic image content-block `source` dict —
    either {type:"base64",media_type,data} or {type:"url",url}."""
    if not has_api_key():
        return mock_result()
    raw = await _call_claude(image_source)
    return _to_result(raw)


async def _call_claude(image_source: dict) -> dict[str, Any]:
    import anthropic

    client = anthropic.AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env
    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": image_source},
                    {"type": "text", "text": "Analyze this image."},
                ],
            }
        ],
    )
    text = "".join(
        block.text for block in message.content if block.type == "text"
    ).strip()
    return _extract_json(text)


def _extract_json(text: str) -> dict[str, Any]:
    """Claude is told 'raw JSON only', but strip a stray ```json fence or
    surrounding prose defensively before parsing."""
    t = text.strip()
    if t.startswith("```"):
        t = t[3:]
        if t[:4].lower() == "json":
            t = t[4:]
        if t.endswith("```"):
            t = t[:-3]
        t = t.strip()
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        t = t[start : end + 1]
    return json.loads(t)


def _conf(node: Any, default_label: str = "unknown") -> ConfidenceValue:
    if not isinstance(node, dict):
        return ConfidenceValue(label=default_label, confidence=0.0)
    label = node.get("label") or default_label
    raw = node.get("confidence")
    return ConfidenceValue(
        label=str(label),
        confidence=float(raw) if isinstance(raw, (int, float)) else 0.0,
    )


def _to_result(raw: dict[str, Any]) -> CvAnalysisResult:
    coat = raw.get("coat") if isinstance(raw.get("coat"), dict) else {}
    surroundings: list[SurroundingLabel] = []
    for item in (raw.get("surroundings") or [])[:4]:
        if isinstance(item, dict) and item.get("label"):
            c = item.get("confidence")
            surroundings.append(
                SurroundingLabel(
                    label=str(item["label"]),
                    confidence=float(c) if isinstance(c, (int, float)) else 0.0,
                )
            )

    return CvAnalysisResult(
        is_cat=bool(raw.get("isCat", False)),
        confidence=float(raw.get("confidence") or 0.0),
        breed=_conf(raw.get("breed")),
        pose=_conf(raw.get("pose")),
        face_orientation=_conf(raw.get("faceOrientation")),
        eye_openness=_conf(raw.get("eyeOpenness"), "open"),
        ear_orientation=_conf(raw.get("earOrientation"), "relaxed"),
        tail_visible=bool(raw.get("tailVisible", False)),
        coat=CoatResult(
            color=str(coat.get("color") or "unknown"),
            pattern=str(coat.get("pattern") or "unknown"),
            confidence=(
                float(coat.get("confidence"))
                if isinstance(coat.get("confidence"), (int, float))
                else 0.0
            ),
        ),
        estimated_age_group=_conf(raw.get("estimatedAgeGroup"), "adult"),
        surroundings=surroundings,
        mock=False,
    )


def mock_result() -> CvAnalysisResult:
    """Labelled placeholder returned when ANTHROPIC_API_KEY is unset. Every
    confidence is 0.0 so nothing downstream mistakes it for a real reading;
    `mock=True` makes it explicit on the wire."""
    return CvAnalysisResult(
        is_cat=True,
        confidence=0.0,
        breed=ConfidenceValue(label="Domestic Shorthair", confidence=0.0),
        pose=ConfidenceValue(label="sitting", confidence=0.0),
        face_orientation=ConfidenceValue(label="facing camera", confidence=0.0),
        eye_openness=ConfidenceValue(label="open", confidence=0.0),
        ear_orientation=ConfidenceValue(label="relaxed", confidence=0.0),
        tail_visible=True,
        coat=CoatResult(color="unknown", pattern="unknown", confidence=0.0),
        estimated_age_group=ConfidenceValue(label="adult", confidence=0.0),
        surroundings=[],
        mock=True,
    )
