"""
services/ai/app/models/registry.py

Single place that owns loading real model weights from a local cache
directory (MODEL_CACHE_DIR, default ./model_cache). Models are loaded
lazily (first request that needs them) and cached in-process afterward —
so the FastAPI process starts up instantly even though weight loading is
slow, and a request that doesn't need a particular model never pays for it.

CRITICAL HONESTY CONSTRAINT: if a weight file isn't present locally, this
raises ModelNotAvailableError with a clear, actionable message rather than
falling back to fabricated output. This is the direct enforcement of the
project brief's "never invent confidence values" rule at the infrastructure
level — there is no code path here that produces a CV result without a
real model having actually run.

Run `scripts/download_models.sh` (repo root) once, with normal internet
access, to populate MODEL_CACHE_DIR before these will work. See that
script's header comment and docs/architecture/03-ai-pipeline.md for why
this is a manual one-time step rather than automatic: this development
environment's network is restricted to a small allowlist of domains and
cannot reach any model-weight host (HuggingFace, GitHub release assets,
PyTorch's own CDN) — verified directly, not assumed, before writing this
module. Production deployment should bake the model cache into the AI
service's Docker image build step instead of running this interactively.
"""

import os
from pathlib import Path
from typing import Any

MODEL_CACHE_DIR = Path(os.getenv("MODEL_CACHE_DIR", "./model_cache"))


class ModelNotAvailableError(RuntimeError):
    """Raised when a required model weight file is missing from the local
    cache. Callers (routers) should turn this into a clear 503 response —
    never catch-and-fabricate."""

    def __init__(self, model_name: str, expected_path: Path):
        super().__init__(
            f"Model '{model_name}' is not available: expected weights at "
            f"'{expected_path}', which does not exist. Run "
            f"scripts/download_models.sh with normal internet access to "
            f"populate the model cache, then restart this service."
        )
        self.model_name = model_name
        self.expected_path = expected_path


_cache: dict[str, Any] = {}


def get_yolo_detector():
    """Returns a cached ultralytics YOLO model for cat detection + the
    bounding-box crop that downstream classifiers (breed, pose, coat) run
    against. Loaded from MODEL_CACHE_DIR/yolov8n.pt — see
    scripts/download_models.sh."""
    if "yolo" in _cache:
        return _cache["yolo"]

    weight_path = MODEL_CACHE_DIR / "yolov8n.pt"
    if not weight_path.exists():
        raise ModelNotAvailableError("yolov8n", weight_path)

    from ultralytics import YOLO

    model = YOLO(str(weight_path))
    _cache["yolo"] = model
    return model


def get_clip_model():
    """Returns a cached (model, processor) tuple for CLIP, used by both
    surroundings zero-shot classification (pipelines/cv/surroundings.py)
    and same-cat re-identification embeddings (pipelines/embeddings/).
    Loaded from a local snapshot directory rather than transformers'
    default HuggingFace Hub auto-download, since this environment cannot
    reach huggingface.co — see scripts/download_models.sh, which uses
    huggingface_hub's snapshot_download from a machine that CAN reach it,
    then this just loads the resulting local files."""
    if "clip" in _cache:
        return _cache["clip"]

    snapshot_dir = MODEL_CACHE_DIR / "clip-vit-base-patch32"
    if not snapshot_dir.exists():
        raise ModelNotAvailableError("clip-vit-base-patch32", snapshot_dir)

    from transformers import CLIPModel, CLIPProcessor

    model = CLIPModel.from_pretrained(str(snapshot_dir))
    processor = CLIPProcessor.from_pretrained(str(snapshot_dir))
    _cache["clip"] = (model, processor)
    return model, processor


def get_breed_classifier():
    """Returns a cached EfficientNet-based breed classifier fine-tuned on
    cat breeds. Loaded from MODEL_CACHE_DIR/breed_classifier.pt.

    HONESTY NOTE, scoped to this function specifically: as of this
    milestone, no fine-tuned cat-breed checkpoint exists anywhere to
    download — fine-tuning one requires a labeled dataset (e.g. the Oxford-
    IIIT Pet Dataset, named in the project brief) and a training run that
    is out of scope for this milestone's available time/compute (single
    CPU core, no GPU, in this sandbox). This function is fully wired and
    will work the moment a real checkpoint is placed at that path — the
    architecture does not need to change, only the artifact does. Until
    then it raises ModelNotAvailableError like every other missing model,
    rather than returning a fabricated breed label."""
    if "breed" in _cache:
        return _cache["breed"]

    weight_path = MODEL_CACHE_DIR / "breed_classifier.pt"
    if not weight_path.exists():
        raise ModelNotAvailableError("breed_classifier", weight_path)

    import torch

    model = torch.load(str(weight_path), map_location="cpu", weights_only=True)
    _cache["breed"] = model
    return model


def clear_cache() -> None:
    """Test-only: drop cached models so a test can verify fresh-load
    behavior (e.g. ModelNotAvailableError) without process restart."""
    _cache.clear()
