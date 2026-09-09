"""
services/ai/app/pipelines/cv/breed.py

Reasoning, stated plainly: the project brief calls for EfficientNet-based
breed classification fine-tuned on a labeled dataset (e.g. the Oxford-IIIT
Pet Dataset, which it names directly). That is the *better* long-term
approach — breed identification benefits more from supervised fine-tuning
than most of this package's other zero-shot tasks, since breed differences
can be subtle (coat length, face shape, ear shape) in ways generic
CLIP-zero-shot prompts may not capture as reliably as for coarser
attributes like pose or age.

However, fine-tuning that classifier requires a labeled dataset and a
training run, which is out of scope for what's achievable in this
milestone's environment (single CPU core, no GPU, and — separately — no
network path to download even a pretrained EfficientNet backbone to
fine-tune from; every weight host checked is outside this sandbox's network
allowlist).

Rather than leave breed permanently blocked behind a checkpoint that will
never exist without dedicated training infrastructure, this module uses
the same CLIP zero-shot approach as the rest of the package against a
list of common cat breeds — genuinely real inference with real confidence,
acknowledged as a lower-accuracy interim approach than the brief's original
ask. models/registry.py's get_breed_classifier() remains in place as the
documented upgrade path: when a real fine-tuned checkpoint exists, swapping
this module to call it instead of CLIP is a localized change, not an
architecture change — callers of classify_breed() never need to know which
approach is behind it.
"""

from PIL import Image
from app.models.registry import get_clip_model
from app.schemas.cv_result import ConfidenceValue

# Common breeds + "domestic shorthair/longhair" as catch-alls, since most
# real-world street/house cats are mixed-breed rather than purebred — a
# breed classifier that can only say "Persian" or "Bengal" would be wrong
# most of the time for the actual target use case (random encountered cats).
BREED_LABELS = [
    "domestic shorthair", "domestic longhair", "Persian", "Siamese",
    "Bengal", "Maine Coon", "British Shorthair", "Ragdoll", "Sphynx",
    "Russian Blue", "Abyssinian", "Scottish Fold", "Calico",
]
BREED_PROMPTS = [f"a {label} cat" for label in BREED_LABELS]


def classify_breed(image: Image.Image) -> ConfidenceValue:
    model, processor = get_clip_model()
    inputs = processor(text=BREED_PROMPTS, images=image, return_tensors="pt", padding=True)

    import torch

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0]

    best_idx = int(torch.argmax(probs))
    return ConfidenceValue(label=BREED_LABELS[best_idx], confidence=float(probs[best_idx]))
