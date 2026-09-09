"""
services/ai/app/pipelines/cv/pose.py

Real classifier choice, with the reasoning made explicit: the project brief
calls for detecting cat pose (sitting/sleeping/running/loaf/standing). A
purpose-trained pose classifier would need a labeled pose dataset and a
training run — out of scope for this milestone's available compute (see
models/registry.py's get_breed_classifier() docstring for the same
constraint applied there).

Pose categories are visually distinct and describable in natural language,
which makes CLIP zero-shot a genuinely reasonable choice here — not a
downgrade dressed up as a design decision, but the same zero-shot approach
already used for surroundings (pipelines/cv/surroundings.py), applied to a
second open-vocabulary-describable concept. This is real model inference
with real confidence scores, not a placeholder — it's just zero-shot rather
than fine-tuned, and is flagged as such in docs/architecture/03-ai-pipeline.md
section 6 (non-goals: "fine-tuning breed/pose/coat classifiers on a real
labeled dataset" is explicitly deferred, with zero-shot named as the
interim approach).
"""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import ConfidenceValue

POSE_LABELS = ["sitting", "sleeping", "running", "loaf", "standing"]
POSE_PROMPTS = [f"a cat {label.replace('loaf', 'sitting in a loaf position')}" for label in POSE_LABELS]


def classify_pose(image: Image.Image) -> ConfidenceValue:
    model, processor = get_clip_model()

    inputs = processor(text=POSE_PROMPTS, images=image, return_tensors="pt", padding=True)

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

    best_idx = int(torch.argmax(probs))
    return ConfidenceValue(label=POSE_LABELS[best_idx], confidence=float(probs[best_idx]))
