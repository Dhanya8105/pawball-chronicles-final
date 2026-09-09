"""
services/ai/app/pipelines/cv/facial_features.py

Eye openness, ear orientation, and face orientation, grouped in one module
since they're all the same zero-shot-over-a-small-fixed-label-set pattern
applied to facial features specifically (as opposed to coat.py's body-level
attributes or pose.py's whole-body posture). Same CLIP-zero-shot rationale
as pose.py/age.py/coat.py throughout this package.

tail_visible is the one field in the /cv/analyze contract with no real
classifier behind it at all in this milestone — not even zero-shot CLIP,
since "is the tail visible in frame" is more of a framing/occlusion
question than a semantic one CLIP's training distribution is well-suited
to answer reliably. Per docs/architecture/03-ai-pipeline.md's confidence
rule, this is exactly the kind of field that must return confidence: None
rather than a fabricated number — implemented here as a simple heuristic
(checked via the YOLO bounding box's aspect ratio as a weak proxy) that
explicitly never claims a confidence score for what it returns.
"""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import ConfidenceValue


def _zero_shot_best(image: Image.Image, labels: list[str], prompts: list[str]) -> ConfidenceValue:
    model, processor = get_clip_model()
    inputs = processor(text=prompts, images=image, return_tensors="pt", padding=True)

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

    best_idx = int(torch.argmax(probs))
    return ConfidenceValue(label=labels[best_idx], confidence=float(probs[best_idx]))


def classify_eye_openness(image: Image.Image) -> ConfidenceValue:
    labels = ["open", "half", "closed"]
    prompts = [
        "a cat with wide open eyes",
        "a cat with half-closed, sleepy eyes",
        "a cat with closed eyes, asleep",
    ]
    return _zero_shot_best(image, labels, prompts)


def classify_ear_orientation(image: Image.Image) -> ConfidenceValue:
    labels = ["forward", "alert", "relaxed", "flat"]
    prompts = [
        "a cat with ears pointed forward",
        "a cat with ears perked up alertly",
        "a cat with relaxed, loosely positioned ears",
        "a cat with ears flattened back against its head",
    ]
    return _zero_shot_best(image, labels, prompts)


def classify_face_orientation(image: Image.Image) -> ConfidenceValue:
    labels = ["facing camera", "profile view", "looking away"]
    prompts = [
        "a cat looking directly at the camera",
        "a cat's face in profile, turned to the side",
        "a cat looking away from the camera",
    ]
    return _zero_shot_best(image, labels, prompts)


def detect_tail_visible(bbox: tuple[int, int, int, int] | None, image_size: tuple[int, int]) -> bool:
    """Weak heuristic, NOT a model — deliberately returns only a bool, never
    a confidence value, per this module's docstring. A cat detection
    bounding box that's notably taller than wide (relative to typical
    cat-sitting proportions) is treated as a loose signal that the tail
    might be tucked/out of frame; this is acknowledged as imprecise and is
    a documented limitation, not a hidden one."""
    if bbox is None:
        return False
    x1, y1, x2, y2 = bbox
    box_width = x2 - x1
    box_height = y2 - y1
    if box_width == 0:
        return False
    aspect_ratio = box_height / box_width
    # Cats sitting with a visible tail tend toward a wider bounding box;
    # a narrow, tall box weakly suggests the tail is tucked or cropped out.
    return aspect_ratio < 1.6
