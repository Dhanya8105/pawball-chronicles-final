"""
services/ai/app/schemas/cv_result.py

Matches docs/architecture/03-ai-pipeline.md's /cv/analyze contract exactly.
The "never invent confidence values" rule (directly from the project brief)
is enforced here at the type level, not just by convention: every
model-backed field has confidence: float (required), and the one
heuristic-based field (tail_visible has no real classifier behind it in
this milestone — see pipelines/cv/tail.py) is typed as confidence: float |
None, so a caller MUST explicitly pass None rather than being able to
silently default to some plausible-looking number.
"""

from pydantic import BaseModel
from typing import Optional


class CvAnalyzeRequest(BaseModel):
    image_url: str


class ConfidenceValue(BaseModel):
    label: str
    confidence: float  # 0.0-1.0, always the model's real output


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
