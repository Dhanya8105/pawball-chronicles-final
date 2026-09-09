"""
services/ai/app/pipelines/imagegen/sdxl_provider.py

Fallback generative provider. Same ComfyUI-API integration pattern as
ComfyUIProvider, pointed at a separately-configured host/checkpoint
(SDXL instead of FLUX.1-Dev), so a FLUX-specific outage/cost issue can fall
back to SDXL before dropping all the way to PlaceholderProvider. Reuses the
same ComfyUI HTTP protocol — only the checkpoint name and default sampler
settings differ from ComfyUIProvider, which is why this subclasses rather
than duplicating the client logic.
"""

import os
from app.pipelines.imagegen.comfyui_provider import ComfyUIProvider, _build_workflow
from app.pipelines.imagegen.prompt_builder import build_prompt, NEGATIVE_PROMPT
from app.schemas.imagegen import ImageGenRequest
import uuid

SDXL_HOST = os.getenv("SDXL_COMFYUI_HOST", os.getenv("COMFYUI_HOST", "http://localhost:8188"))


class SDXLProvider(ComfyUIProvider):
    def __init__(self):
        super().__init__()
        self._client.base_url = SDXL_HOST

    @property
    def name(self) -> str:
        return "comfyui-sdxl"

    async def submit(self, request: ImageGenRequest) -> str:
        prompt = build_prompt(request)
        client_id = str(uuid.uuid4())
        workflow = _build_workflow(prompt, NEGATIVE_PROMPT, seed=uuid.uuid4().int % (2**32))
        # SDXL checkpoint differs from the FLUX default baked into _build_workflow
        workflow["4"]["inputs"]["ckpt_name"] = "sd_xl_base_1.0.safetensors"
        resp = await self._client.post(
            "/prompt", json={"prompt": workflow, "client_id": client_id}
        )
        resp.raise_for_status()
        return resp.json()["prompt_id"]
