"""
services/ai/app/routers/cv.py

POST /cv/analyze — Gemini Vision CV.

Accepts either:
  - a multipart `image` file part, or
  - a JSON body: { "image_url": "https://..." }

Returns a `CvAnalysisResult` (same shape as packages/shared-types). There
is no local inference and no model-weight download; when `GEMINI_API_KEY`
is unset the response is a clearly-labelled mock (`mock: true`) so the
capture pipeline still runs in local dev — see app/services/vision_cv.py.
"""

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.schemas.cv_result import CvAnalysisResult
from app.services.vision_cv import analyze_image_bytes
from app.utils.http import fetch_image_bytes

router = APIRouter(prefix="/cv", tags=["cv"])

_EXT_MEDIA_TYPE = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
    "heic": "image/heic",
}


def _media_type(name: str | None, content_type: str | None) -> str:
    if content_type and content_type.startswith("image/"):
        return "image/jpeg" if content_type == "image/jpg" else content_type
    if name and "." in name:
        ext = name.rsplit("?", 1)[0].rsplit(".", 1)[-1].lower()
        return _EXT_MEDIA_TYPE.get(ext, "image/jpeg")
    return "image/jpeg"


@router.post("/analyze", response_model=CvAnalysisResult)
async def analyze(
    request: Request,
    image: UploadFile | None = File(default=None),
) -> CvAnalysisResult:
    if image is not None:
        data = await image.read()
        if not data:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")
        media_type = _media_type(image.filename, image.content_type)
    else:
        try:
            body = await request.json()
        except Exception:
            body = {}
        image_url = (body or {}).get("image_url")
        if not image_url:
            raise HTTPException(
                status_code=400,
                detail="Provide a multipart 'image' file part or a JSON body with 'image_url'.",
            )
        try:
            data = await fetch_image_bytes(str(image_url))
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Could not fetch image_url: {exc}"
            )
        media_type = _media_type(str(image_url), None)

    try:
        return await analyze_image_bytes(data, media_type)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — surface a clean 502 to the caller
        raise HTTPException(status_code=502, detail=f"CV analysis failed: {exc}")
