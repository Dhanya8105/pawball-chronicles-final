"""
services/ai/app/pipelines/imagegen/placeholder_provider.py

Real, working implementation — not a stub. While no GPU/ComfyUI host is
provisioned, this provider lets the entire Capture -> Bond -> Aura -> Lore ->
Collection pipeline be exercised end-to-end with genuine generated artifacts
(not silently-faked URLs). Output is deliberately styled as "placeholder-tier"
(simple composited frame, not an AI painting) so it's never mistaken for the
real FLUX/SDXL output it will be swapped for later.

Approach: original photo, center-cropped to a card aspect ratio, framed in a
border colored by `fantasy_class`, with an `element`-colored corner glow (SVG
gradient rendered via Pillow), and the fantasy region name as a footer caption.
"""

import io
import uuid
from PIL import Image, ImageDraw, ImageFont, ImageOps

from app.pipelines.imagegen.provider import ImageGenerationProvider
from app.schemas.imagegen import ImageGenRequest, ImageGenJobStatus
from app.utils.cloudinary_client import upload_image_bytes
from app.utils.http import fetch_image_bytes

CLASS_COLORS = {
    "Rogue": (90, 60, 110),
    "Mage": (50, 90, 160),
    "Guardian": (140, 100, 40),
    "Explorer": (200, 130, 40),
    "Hunter": (60, 120, 70),
}
ELEMENT_GLOW = {
    "Moon": (180, 190, 230),
    "Solar": (250, 200, 80),
    "Storm": (120, 140, 200),
    "Shadow": (70, 50, 90),
    "Crystal": (170, 220, 230),
}

CARD_SIZE = (768, 1024)
BORDER = 28


class PlaceholderProvider(ImageGenerationProvider):
    def __init__(self):
        # in-memory job store; fine for a synchronous placeholder provider —
        # real providers (ComfyUI) will back this with actual queue state
        self._jobs: dict[str, ImageGenJobStatus] = {}

    @property
    def name(self) -> str:
        return "placeholder"

    async def submit(self, request: ImageGenRequest) -> str:
        job_id = str(uuid.uuid4())
        try:
            image_url = await self._composite(request)
            self._jobs[job_id] = ImageGenJobStatus(
                job_id=job_id,
                status="complete",
                image_url=image_url,
                provider_used=self.name,
            )
        except Exception as e:
            self._jobs[job_id] = ImageGenJobStatus(
                job_id=job_id,
                status="failed",
                error=str(e),
                provider_used=self.name,
            )
        return job_id

    async def get_status(self, job_id: str) -> ImageGenJobStatus:
        if job_id not in self._jobs:
            return ImageGenJobStatus(
                job_id=job_id, status="failed", error="unknown job_id",
                provider_used=self.name,
            )
        return self._jobs[job_id]

    async def _composite(self, request: ImageGenRequest) -> str:
        original_bytes = await fetch_image_bytes(request.original_image_url)
        photo = Image.open(io.BytesIO(original_bytes)).convert("RGB")
        photo = ImageOps.fit(
            photo,
            (CARD_SIZE[0] - 2 * BORDER, CARD_SIZE[1] - 2 * BORDER - 80),
            method=Image.LANCZOS,
        )

        class_color = CLASS_COLORS.get(request.fantasy_class, (80, 80, 80))
        glow_color = ELEMENT_GLOW.get(request.element, (200, 200, 200))

        card = Image.new("RGB", CARD_SIZE, class_color)
        card.paste(photo, (BORDER, BORDER))

        # corner glow, soft radial via simple alpha-blended ellipse
        glow_layer = Image.new("RGBA", CARD_SIZE, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_layer)
        glow_draw.ellipse(
            [-150, -150, 350, 350],
            fill=(*glow_color, 90),
        )
        card = Image.alpha_composite(card.convert("RGBA"), glow_layer).convert("RGB")

        draw = ImageDraw.Draw(card)
        footer_top = CARD_SIZE[1] - 80
        draw.rectangle(
            [0, footer_top, CARD_SIZE[0], CARD_SIZE[1]], fill=class_color
        )
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", 28)
        except OSError:
            font = ImageFont.load_default()
        caption = f"{request.fantasy_class} · {request.element} · {request.region}"
        draw.text((BORDER, footer_top + 24), caption, fill=(255, 255, 255), font=font)

        buf = io.BytesIO()
        card.save(buf, format="JPEG", quality=90)
        buf.seek(0)
        return await upload_image_bytes(buf.read(), folder="pawball/placeholder-art")
