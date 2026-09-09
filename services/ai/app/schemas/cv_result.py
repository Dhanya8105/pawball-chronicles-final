"""
services/ai/app/schemas/cv_result.py

Matches docs/architecture/03-ai-pipeline.md's /cv/analyze contract and the
`CvAnalysisResult` type in packages/shared-types. The "never invent
confidence values" rule still holds: for a real cat reading every
model-backed field carries Claude Vision's own confidence estimate; when no
cat is present the orchestrator fills `label:"unknown", confidence:0.0`
rather than fabricating a plausible number.

`mock` is set to true only by the no-API-key fallback in
app/services/vision_cv.py, so a caller can tell a real analysis apart from
the dev placeholder.
"""

from pydantic import BaseModel
from typing import Optional


class CvAnalyzeRequest(BaseModel):
    image_url: str


class ConfidenceValue(BaseModel):
    label: str
    confidence: float  # 0.0-1.0


class NullableConfidenceValue(BaseModel):
    label: str
    confidence: Optional[float] = None


class CoatResult(BaseModel):
    color: str
    pattern: str
    confidence: float


class SurroundingLabel(BaseModel):
    label: str
    confidence: float


class CvAnalysisResult(BaseModel):
    is_cat: bool
    confidence: float
    breed: ConfidenceValue
    pose: ConfidenceValue
    face_orientation: ConfidenceValue
    eye_openness: ConfidenceValue
    ear_orientation: ConfidenceValue
    tail_visible: bool
    coat: CoatResult
    estimated_age_group: ConfidenceValue
    surroundings: list[SurroundingLabel]
    mock: Optional[bool] = None
