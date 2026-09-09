"""services/ai/app/pipelines/imagegen/prompt_builder.py

Centralized prompt construction so art style stays consistent regardless of
which generative provider executes it. See docs/architecture/03-ai-pipeline.md
section 3.
"""

from app.schemas.imagegen import ImageGenRequest

BASE_STYLE = (
    "premium fantasy trading card illustration, cute, highly detailed, "
    "expressive eyes, soft cinematic lighting, rich colors, painterly"
)

NEGATIVE_PROMPT = (
    "photorealistic, blurry, distorted anatomy, extra limbs, text, watermark, "
    "low quality, deformed face"
)


def build_prompt(request: ImageGenRequest) -> str:
    preserve = (
        f"preserve {request.coat_color} {request.coat_pattern} fur, "
        f"{request.breed} facial structure and proportions"
    )
    fantasy = (
        f"{request.fantasy_class} themed armor and accessories, "
        f"{request.element} elemental magical effects, set in {request.region}"
    )
    pose_desc = f"{request.pose} pose"
    return f"{BASE_STYLE}, {preserve}, {fantasy}, {pose_desc}"
