"""
services/ai/app/services/vision_cv.py

Google Gemini Vision as the CV pipeline. Sends the capture image to the
Gemini API (`gemini-flash-lite-latest` by default, override with `GEMINI_MODEL`)
with a strict JSON-only instruction, then maps the reply onto
`CvAnalysisResult`. No local model weights, no PyTorch.

If `GEMINI_API_KEY` is unset the service returns a clearly-labelled mock
result (`mock=True`, `confidence=0.0`) so the capture → bond → lore
pipeline still runs end-to-end in local dev without a key. Get a free key
at https://aistudio.google.com/app/apikey.
"""

import asyncio
import json
import os
from typing import Any

from app.schemas.cv_result import (
    CoatResult,
    ConfidenceValue,
    CvAnalysisResult,
    SurroundingLabel,
)

MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

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
coat.color MUST be the single closest match from this list, nothing else:
  orange|black|white|grey|brown|cream|calico|tabby|black-and-white|tortoiseshell|golden
surroundings: up to 4 labels, and EVERY label MUST come from this list, nothing else:
  temple|shrine|garden|park|forest|beach|coast|alley|street|market|indoor|rooftop|construction|night|rain|sunset|snow
Omit any surroundings label that does not clearly apply; do not invent new labels.
If no cat is present return isCat:false with confidence and nulls elsewhere.
No markdown. No explanation. Raw JSON only."""


def has_api_key() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


async def analyze_image_bytes(image_bytes: bytes, media_type: str) -> CvAnalysisResult:
    """image_bytes is the raw image; media_type is its MIME type
    (e.g. 'image/jpeg'). The caller (routers/cv.py) reads a multipart file
    or fetches an image_url into bytes before calling this."""
    if not has_api_key():
        return mock_result()
    raw = await _call_gemini(image_bytes, media_type)
    return _to_result(raw)


# Current flash models spend a few hundred tokens on internal reasoning that
# also counts against max_output_tokens, and thinking can't be disabled on
# them — so the budget has to cover reasoning + the ~350-token JSON.
_MAX_OUTPUT_TOKENS = 4096
_RETRIES = 3


async def _call_gemini(image_bytes: bytes, media_type: str) -> dict[str, Any]:
    from google import genai
    from google.genai import errors as genai_errors
    from google.genai import types

    # A hard HTTP timeout so a stalled call raises (and the retry below can
    # recover) instead of hanging the worker.
    client = genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(timeout=45_000),
    )
    request = dict(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=media_type),
            "Analyze this image.",
        ],
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            max_output_tokens=_MAX_OUTPUT_TOKENS,
            temperature=0.0,
        ),
    )

    import httpx

    # Transient: 5xx overload ("model is experiencing high demand") and
    # request timeouts. 4xx (ClientError) is not retried — it surfaces.
    transient = (genai_errors.ServerError, httpx.TimeoutException, httpx.TransportError)

    last_exc: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            response = await client.aio.models.generate_content(**request)
            break
        except transient as exc:
            last_exc = exc
            if attempt == _RETRIES - 1:
                raise
            await asyncio.sleep(1.5 * (attempt + 1))
    else:  # pragma: no cover
        raise last_exc  # type: ignore[misc]

    finish = (
        str(response.candidates[0].finish_reason)
        if response.candidates
        else "no candidates"
    )
    text = response.text
    if not text:
        raise RuntimeError(
            f"Gemini returned no text (finish_reason={finish}, "
            f"prompt_feedback={getattr(response, 'prompt_feedback', None)})"
        )
    if "MAX_TOKENS" in finish:
        raise RuntimeError(
            f"Gemini response was truncated (finish_reason={finish}); "
            f"raise _MAX_OUTPUT_TOKENS."
        )
    return _extract_json(text)


def _extract_json(text: str) -> dict[str, Any]:
    """Gemini is asked for `application/json`, but strip a stray ```json
    fence or surrounding prose defensively before parsing."""
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
    """Labelled placeholder returned when GEMINI_API_KEY is unset. Every
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
