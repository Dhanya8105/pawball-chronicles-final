"""services/ai/app/pipelines/cv/age.py — same zero-shot rationale as pose.py."""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import ConfidenceValue

AGE_LABELS = ["kitten", "adult", "senior"]
AGE_PROMPTS = [
    "a young kitten, small and playful",
    "a fully grown adult cat",
    "an old senior cat",
]


def classify_age_group(image: Image.Image) -> ConfidenceValue:
    model, processor = get_clip_model()
    inputs = processor(text=AGE_PROMPTS, images=image, return_tensors="pt", padding=True)

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

    best_idx = int(torch.argmax(probs))
    return ConfidenceValue(label=AGE_LABELS[best_idx], confidence=float(probs[best_idx]))
