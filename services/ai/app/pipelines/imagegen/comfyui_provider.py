"""
services/ai/app/pipelines/imagegen/comfyui_provider.py

Talks to a real ComfyUI server's HTTP API. This is NOT a fake stub — the
submit/poll/download logic against ComfyUI's actual API shape is implemented
for real. What it needs to actually run is a `COMFYUI_HOST` pointing at a
provisioned GPU box (local or rented) with FLUX.1-Dev loaded. Until that host
exists, this provider will raise on `submit()` (connection refused), which is
exactly what triggers the configured fallback chain
(IMAGE_GEN_FALLBACK_CHAIN=comfyui,sdxl,placeholder) to drop through to a
working provider — see provider __init__.py.
"""

import json
import os
import uuid
import httpx

from app.pipelines.imagegen.provider import ImageGenerationProvider
from app.pipelines.imagegen.prompt_builder import build_prompt, NEGATIVE_PROMPT
from app.schemas.imagegen import ImageGenRequest, ImageGenJobStatus
from app.utils.cloudinary_client import upload_image_bytes

COMFYUI_HOST = os.getenv("COMFYUI_HOST", "http://localhost:8188")


def _build_workflow(prompt: str, negative_prompt: str, seed: int) -> dict:
    """
    Minimal FLUX.1-Dev txt2img workflow graph in ComfyUI's node-graph JSON
    format. A real deployment should externalize this as a checked-in
    workflow JSON template (exported from the ComfyUI UI) rather than
    constructing it inline — this inline version covers the minimum nodes
    (CheckpointLoader -> CLIPTextEncode x2 -> KSampler -> VAEDecode -> SaveImage)
    needed to validate the integration end-to-end against a real host.
    """
    return {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 28, "cfg": 3.5, "sampler_name": "euler",
            "scheduler": "normal", "denoise": 1.0,
            "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0],
            "latent_image": ["5", 0],
        }},
        "4": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative_prompt, "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode",
              "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage",
              "inputs": {"images": ["8", 0], "filename_prefix": "pawball"}},
    }


class ComfyUIProvider(ImageGenerationProvider):
    def __init__(self):
        self._client = httpx.AsyncClient(base_url=COMFYUI_HOST, timeout=120)

    @property
    def name(self) -> str:
        return "comfyui-flux1dev"

    async def submit(self, request: ImageGenRequest) -> str:
        prompt = build_prompt(request)
        client_id = str(uuid.uuid4())
        workflow = _build_workflow(prompt, NEGATIVE_PROMPT, seed=uuid.uuid4().int % (2**32))
        resp = await self._client.post(
            "/prompt",
            json={"prompt": workflow, "client_id": client_id},
        )
        resp.raise_for_status()
        prompt_id = resp.json()["prompt_id"]
        return prompt_id

    async def get_status(self, job_id: str) -> ImageGenJobStatus:
        resp = await self._client.get(f"/history/{job_id}")
        resp.raise_for_status()
        history = resp.json()

        if job_id not in history:
            return ImageGenJobStatus(
                job_id=job_id, status="processing", provider_used=self.name
            )

        outputs = history[job_id].get("outputs", {})
        image_meta = None
        for node_output in outputs.values():
            if "images" in node_output:
                image_meta = node_output["images"][0]
                break

        if not image_meta:
            return ImageGenJobStatus(
                job_id=job_id, status="failed",
                error="no image output found in ComfyUI history",
                provider_used=self.name,
            )

        img_resp = await self._client.get("/view", params={
            "filename": image_meta["filename"],
            "subfolder": image_meta.get("subfolder", ""),
            "type": image_meta.get("type", "output"),
        })
        img_resp.raise_for_status()
        image_url = await upload_image_bytes(
            img_resp.content, folder="pawball/generated-art"
        )
        return ImageGenJobStatus(
            job_id=job_id, status="complete", image_url=image_url,
            provider_used=self.name,
        )
