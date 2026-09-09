"""
services/ai/app/pipelines/cv/surroundings.py

CLIP zero-shot classification against the fixed surroundings label set from
the project brief. Zero-shot is the right tool here (rather than a trained
classifier) precisely because the label set is fixed and given upfront
(forest, street, temple, beach, rain, night, etc.) rather than learned from
a labeled dataset — see docs/architecture/03-ai-pipeline.md section 4 for
the full rationale.

Real softmax-over-cosine-similarity confidence is returned per label,
thresholded so only labels CLIP is actually confident about are returned —
not every label in the set with a near-zero score attached.
"""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import SurroundingLabel

SURROUNDING_LABELS = [
    "forest", "street", "temple", "garden", "beach", "rain", "night",
    "apartment", "village", "urban alley", "marketplace", "cafe",
    "mountain", "water", "trees", "flowers", "sunset", "morning", "fog",
]

# Labels below this confidence are dropped rather than returned with a
# near-zero score — a near-zero confidence isn't a fabricated value (it IS
# CLIP's real output), but returning all 19 labels for every image would
# bury the genuinely relevant ones in noise the Region/Lore engines would
# have to filter anyway. Threshold is a product/UX tuning knob, not a
# correctness one, and lives here rather than buried in the orchestrator.
CONFIDENCE_THRESHOLD = 0.05


def classify_surroundings(image: Image.Image) -> list[SurroundingLabel]:
    model, processor = get_clip_model()

    inputs = processor(
        text=SURROUNDING_LABELS, images=image, return_tensors="pt", padding=True
    )

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        logits_per_image = outputs.logits_per_image
        probs = logits_per_image.softmax(dim=1)[0]

    results = [
        SurroundingLabel(label=label, confidence=float(prob))
        for label, prob in zip(SURROUNDING_LABELS, probs.tolist())
        if float(prob) >= CONFIDENCE_THRESHOLD
    ]

    results.sort(key=lambda r: r.confidence, reverse=True)
    return results
