"""
services/ai/app/routers/imagegen.py

Demonstrates the entire point of the provider abstraction: this router
contains zero references to ComfyUI/SDXL/Placeholder by name. It only calls
get_provider_chain() and iterates. Swapping which providers exist, or their
order, never requires touching this file.
"""

from fastapi import APIRouter, HTTPException
from app.schemas.imagegen import ImageGenRequest, ImageGenJobStatus
from app.pipelines.imagegen import get_provider_chain

router = APIRouter(prefix="/imagegen", tags=["imagegen"])

# in-memory map of jobId -> which provider instance owns it, so status polls
# go back to the same provider that accepted the submission. A multi-instance
# deployment would back this with Redis instead.
_job_owner: dict[str, "ImageGenerationProvider"] = {}  # noqa: F821


@router.post("/generate", response_model=dict)
async def generate(request: ImageGenRequest):
    chain = get_provider_chain()
    last_error = None
    for provider in chain:
        try:
            job_id = await provider.submit(request)
            _job_owner[job_id] = provider
            return {"jobId": job_id, "status": "queued", "providerUsed": provider.name}
        except Exception as e:  # noqa: BLE001 - intentionally broad: any
            # provider failure should fall through to the next in the chain
            last_error = e
            continue
    raise HTTPException(
        status_code=502,
        detail=f"All image generation providers failed. Last error: {last_error}",
    )


@router.get("/status/{job_id}", response_model=ImageGenJobStatus)
async def get_status(job_id: str):
    provider = _job_owner.get(job_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return await provider.get_status(job_id)
