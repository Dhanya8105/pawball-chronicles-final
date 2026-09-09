"""
services/ai/app/routers/cv.py

Mirrors the honesty pattern from routers/imagegen.py: this router contains
no fallback-to-fake-data logic. If models aren't available locally
(ModelNotAvailableError), the client gets a clear 503 with an actionable
message — never a 200 with fabricated confidence values.
"""

from fastapi import APIRouter, HTTPException

from app.models.registry import ModelNotAvailableError
from app.schemas.cv_result import CvAnalysisResult, CvAnalyzeRequest
from app.services.cv_orchestrator import analyze_image
from app.utils.http import fetch_image_bytes
from PIL import Image
import io

router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/analyze", response_model=CvAnalysisResult)
async def analyze(request: CvAnalyzeRequest):
    try:
        image_bytes = await fetch_image_bytes(request.image_url)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load image: {e}")

    try:
        return analyze_image(image)
    except ModelNotAvailableError as e:
        raise HTTPException(status_code=503, detail=str(e))
