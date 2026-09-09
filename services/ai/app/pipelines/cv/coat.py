"""
services/ai/app/pipelines/cv/coat.py

Same zero-shot rationale as pose.py. Color and pattern are classified
independently (two separate CLIP passes) since they're orthogonal — a cat's
color (orange, black, white, grey, calico, tabby-brown...) and its pattern
(solid, tabby, tuxedo, spotted, calico, tortoiseshell...) vary independently,
so forcing a single combined label set would create a combinatorial
explosion of prompts for no accuracy benefit.
"""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import CoatResult

COLOR_LABELS = ["orange", "black", "white", "grey", "brown", "calico", "cream"]
PATTERN_LABELS = ["solid", "tabby", "tuxedo", "spotted", "calico", "tortoiseshell", "bicolor"]


def _zero_shot_best(image: Image.Image, labels: list[str], prompt_template: str) -> tuple[str, float]:
    model, processor = get_clip_model()
    prompts = [prompt_template.format(label=label) for label in labels]
    inputs = processor(text=prompts, images=image, return_tensors="pt", padding=True)

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

    best_idx = int(torch.argmax(probs))
    return labels[best_idx], float(probs[best_idx])


def classify_coat(image: Image.Image) -> CoatResult:
    color, color_conf = _zero_shot_best(
        image, COLOR_LABELS, "a {label} colored cat"
    )
    pattern, pattern_conf = _zero_shot_best(
        image, PATTERN_LABELS, "a cat with a {label} coat pattern"
    )
    # Single combined confidence: the lower of the two real confidences,
    # since the overall coat reading is only as reliable as its weaker
    # component — never averaged up to look more confident than either
    # individual classification actually was.
    return CoatResult(color=color, pattern=pattern, confidence=min(color_conf, pattern_conf))
