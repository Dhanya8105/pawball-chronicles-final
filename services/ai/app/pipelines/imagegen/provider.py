"""
services/ai/app/pipelines/imagegen/provider.py

The swappable image-generation interface. See docs/architecture/03-ai-pipeline.md
section 2 for the full rationale. The contract: callers (routers/imagegen.py)
never branch on which provider is active — they only ever call submit() and
get_status(). Swapping Placeholder -> ComfyUI/FLUX -> SDXL is purely a matter
of which class get_provider() instantiates, driven by env var.
"""

from abc import ABC, abstractmethod
from app.schemas.imagegen import ImageGenRequest, ImageGenJobStatus


class ImageGenerationProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Stable identifier, persisted to pawballs.artwork.history.providerUsed
        so we always know, in hindsight, which backend produced a given piece
        of art — important once we're mixing Placeholder-era and real-art-era
        history on the same PawBall."""
        ...

    @abstractmethod
    async def submit(self, request: ImageGenRequest) -> str:
        """Submit a generation request. Returns a jobId.
        Synchronous providers (e.g. Placeholder) may complete the work here
        and just return a jobId whose status is immediately 'complete'."""
        ...

    @abstractmethod
    async def get_status(self, job_id: str) -> ImageGenJobStatus:
        """Poll job status. Must be idempotent and safe to call repeatedly."""
        ...
