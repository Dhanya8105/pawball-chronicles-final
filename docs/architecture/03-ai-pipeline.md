# PawBall Chronicles — AI Pipeline Architecture

## 1. Service contract: apps/api ↔ services/ai

`services/ai` exposes three internal endpoints. All are stateless — they read an
image, return structured data, and touch no database.

### `POST /cv/analyze`
Request: `{ imageUrl: string }`
Response:
```ts
{
  isCat: boolean,
  confidence: number,
  breed: { label: string, confidence: number },
  pose: { label: 'sitting'|'sleeping'|'running'|'loaf'|'standing'|..., confidence: number },
  faceOrientation: { label: string, confidence: number },
  eyeOpenness: { label: 'open'|'half'|'closed', confidence: number },
  earOrientation: { label: 'forward'|'alert'|'relaxed'|'flat', confidence: number },
  tailVisible: boolean,
  coat: { color: string, pattern: string, confidence: number },
  estimatedAgeGroup: { label: 'kitten'|'adult'|'senior', confidence: number },
  surroundings: { labels: string[], confidence: number }[],
}
```
**Hard rule, directly from the spec:** "Never invent confidence values." Every
classifier output here carries its real softmax/model confidence. If a model
genuinely can't produce a calibrated confidence (e.g., a rule-based heuristic
for tail visibility), the field is typed `confidence: number | null` and the
frontend renders "uncertain" rather than a fabricated number. This is enforced
at the Pydantic schema level (`schemas/cv_result.py`) — confidence is a required
float for model-backed fields and explicitly nullable for heuristic fields, so
it's a type error, not a convention, to fake one.

### `POST /embeddings/match`
Request: `{ imageUrl: string, ownerId: string }`
Response: `{ embeddingId: string, matchedPawballId: string | null, similarityScore: number | null }`

Internally: compute CLIP embedding → query FAISS index namespaced by `ownerId` →
apply threshold (configurable, default cosine similarity ≥ 0.92 — tuned, not
hardcoded magic, lives in `services/ai/app/config.py`) → return best match or null.

### `POST /imagegen/generate`
Request:
```ts
{
  originalImageUrl: string,
  breed: string,
  coatColor: string,
  coatPattern: string,
  pose: string,
  surroundings: string[],
  fantasyClass: string,       // "Rogue" | "Mage" | etc, from creature generation
  element: string,
  region: string,
}
```
Response: `{ jobId: string, status: 'queued' }` then polled via
`GET /imagegen/status/{jobId}` → `{ status, imageUrl?: string, error?: string }`.

This is async-from-the-caller's-perspective even when the underlying provider is
synchronous (like the Placeholder), so `apps/api`'s BullMQ worker logic doesn't
change when the provider is swapped.

## 2. The swappable Image Generation Provider interface

This is the architectural answer to: *"The architecture must allow replacing the
image generation backend without modifying business logic."*

```python
# services/ai/app/pipelines/imagegen/provider.py
from abc import ABC, abstractmethod
from app.schemas.imagegen import ImageGenRequest, ImageGenJobStatus

class ImageGenerationProvider(ABC):
    """
    Every provider must be able to:
      1. accept a structured generation request and return a job handle
      2. report job status (sync providers report 'complete' immediately)
      3. expose a stable provider name for audit/history (pawballs.artwork.history.providerUsed)
    Callers (the FastAPI router) NEVER branch on provider type. They only
    ever call these three methods.
    """

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def submit(self, request: ImageGenRequest) -> str:
        """Returns a jobId. May internally be synchronous."""
        ...

    @abstractmethod
    async def get_status(self, job_id: str) -> ImageGenJobStatus:
        """Returns status + imageUrl if complete."""
        ...
```

Three implementations, selected purely by env var (`IMAGE_GEN_PROVIDER`), with
no caller-side conditional logic:

- **`ComfyUIProvider`** (`comfyui_provider.py`) — talks to a ComfyUI server over
  its API (local or remote GPU box), submits a FLUX.1-Dev workflow graph,
  polls ComfyUI's own job queue, downloads the result, re-uploads to Cloudinary
  via the shared `utils/cloudinary_client.py`, returns that URL.
- **`SDXLProvider`** — same interface, different model graph; used as the
  configured fallback if `ComfyUIProvider.submit` raises (see retry chain below).
- **`PlaceholderProvider`** (`placeholder_provider.py`) — the one in use *right
  now*, since no GPU host is provisioned yet. It does NOT fake "AI art." It
  deterministically composites: the original cat photo + a fantasy-class-colored
  border/frame + an element-colored particle overlay (SVG) + the fantasy name as
  card-style text, using Pillow. This keeps the full Capture → Bond → Aura →
  Lore → Collection pipeline genuinely testable end-to-end today, with a clearly
  "placeholder-tier" visual quality so it's never mistaken for the real feature.

```python
# services/ai/app/pipelines/imagegen/__init__.py
import os
from .comfyui_provider import ComfyUIProvider
from .sdxl_provider import SDXLProvider
from .placeholder_provider import PlaceholderProvider

def get_provider() -> ImageGenerationProvider:
    name = os.getenv("IMAGE_GEN_PROVIDER", "placeholder")
    return {
        "comfyui": ComfyUIProvider,
        "sdxl": SDXLProvider,
        "placeholder": PlaceholderProvider,
    }[name]()
```

A **fallback chain** (not just a single swap) is configured the same way:
`IMAGE_GEN_FALLBACK_CHAIN=comfyui,sdxl,placeholder` — the router tries each in
order if `.submit()` raises, so a GPU box being temporarily down degrades
gracefully instead of failing the whole capture pipeline.

Switching from Placeholder to real ComfyUI/FLUX later is exactly one env var
change in `services/ai/.env` — zero changes to `apps/api`, zero changes to the
FastAPI routers, zero changes to the BullMQ worker.

## 3. Prompt engineering (for whichever real-image provider is active)

Lives entirely in `pipelines/imagegen/prompt_builder.py`, independent of which
provider executes it — this is what keeps "consistent art style" enforceable
regardless of model swaps:

```python
def build_prompt(req: ImageGenRequest) -> str:
    base_style = (
        "premium fantasy trading card illustration, cute, highly detailed, "
        "expressive eyes, soft cinematic lighting, rich colors, painterly"
    )
    preserve = f"preserve {req.coat_color} {req.coat_pattern} fur, "\
               f"{req.breed} facial structure and proportions"
    fantasy = f"{req.fantasy_class} themed armor and accessories, "\
              f"{req.element} elemental magical effects, "\
              f"set in {req.region}"
    return f"{base_style}, {preserve}, {fantasy}"

NEGATIVE_PROMPT = (
    "photorealistic, blurry, distorted anatomy, extra limbs, text, watermark, "
    "low quality, deformed face"
)
```

Centralizing this means style consistency is a prompt-template/version concern,
testable and diffable in code review, not scattered string concatenation inside
each provider.

## 4. CV pipeline internals

**Current implementation — Gemini Vision.** `POST /cv/analyze`
(`app/routers/cv.py`) accepts a multipart `image` or `{ image_url }`
(fetched to bytes), and `app/services/vision_cv.py` sends it to
`gemini-1.5-flash` (override with `GEMINI_MODEL`) with
`response_mime_type: "application/json"` and a strict schema instruction
that pins every enum (`pose`, `eyeOpenness`, `earOrientation`,
`estimatedAgeGroup`) and caps `surroundings` at four descriptors. The reply
is parsed and normalised onto `CvAnalysisResult` (snake_case Pydantic,
matching `packages/shared-types`). There are **no local model weights** and
no `scripts/download_models.sh`. When `GEMINI_API_KEY` is unset the service
returns a labelled mock (`mock: true`, all confidences `0.0`) so the
downstream pipeline still runs in local dev. Tests: `tests/test_vision_cv.py`
covers the mock path and the JSON parse/normalise helpers.

The provider is a single localised concern — `_call_gemini` in
`vision_cv.py`. An earlier iteration used the Anthropic Messages API
(`claude-sonnet-4-6`); the swap to Gemini touched only that function, the
API key name, and `requirements.txt`.

The confidence-honesty rule still holds — for a real reading each field
carries the model's own estimate; for a non-cat the normaliser fills
`label:"unknown", confidence:0.0` rather than inventing a number.

### Historical: the Milestone-3 YOLOv8 + CLIP pipeline (removed)

The paragraphs below describe the previous local-inference implementation
(`pipelines/cv/`, `services/cv_orchestrator.py`, `models/registry.py`), kept
here for context. That code and its model-weight download step have been
deleted; §6 below is likewise superseded.

Each concern was its own module so models could be upgraded/replaced independently:

- `detection.py` — YOLOv8 (cat detection + bounding box, also feeds pose-crop).
  Uses the stock COCO-pretrained `yolov8n` checkpoint directly — COCO already
  includes "cat" as a class, so no fine-tuning was needed for this one
  sub-task specifically.
- `breed.py`, `pose.py`, `coat.py`, `age.py`, `facial_features.py` — all
  implemented via **CLIP zero-shot classification** against fixed prompt
  sets, for the reason anticipated in this doc's original draft (§6 below):
  no fine-tuned checkpoint exists for cat breed/pose/coat-pattern
  classification (that requires a labeled dataset and a training run, out
  of scope for the compute available when this was built — single CPU
  core, no GPU). Each module's docstring states this tradeoff explicitly
  rather than presenting zero-shot as if it were the originally-planned
  fine-tuned approach.
- `surroundings.py` — CLIP zero-shot, exactly as originally planned (this
  was always the intended approach for this field, not a fallback).
- `tail.py`'s functionality lives in `facial_features.py`'s
  `detect_tail_visible` — explicitly a heuristic (bounding-box aspect
  ratio), not a model call, and returns a plain `bool` with no confidence
  value, per the project's confidence-honesty rule.

`models/registry.py` is the single place that loads real weights from a
local `MODEL_CACHE_DIR`, populated by `scripts/download_models.sh` (repo
root) — a one-time manual step, **not automatic**, because the environment
this was built in has no network path to any model-weight host (HuggingFace,
GitHub release assets, PyTorch's CDN — all checked directly and confirmed
unreachable). If weights aren't present, every `get_*()` function raises
`ModelNotAvailableError` with an actionable message; there is no code path
that returns a CV result without a real model having actually run.

`services/cv_orchestrator.py` calls these in sequence and assembles the
single `/cv/analyze` response — this is the only place that composes them, so
each pipeline module stays independently unit-testable with mocked image
inputs. 18 tests cover the orchestration logic, the tail heuristic, the crop
geometry, the surroundings threshold/sort logic, and the model registry's
fail-loudly behavior — all run without needing real model weights. Verifying
the classifiers' actual accuracy against real cat photos requires running
`scripts/download_models.sh` and is a manual step for whoever has normal
internet access to do it.

## 5. Embeddings + FAISS (`pipelines/embeddings/`)

- `clip_embed.py` — wraps CLIP image encoder, returns a normalized vector.
- `faiss_index.py` — maintains one FAISS index per user (or a single index with
  metadata filtering by `ownerId`, decided at implementation time based on
  expected per-user PawBall counts — documented as an open perf tuning point,
  not pretended to be settled now), persisted to a mounted volume so the index
  survives service restarts.

**Not yet built** — this is Milestone 7 (Bond System) scope, not Milestone 3.

## 6. Non-goals for v1 (explicitly deferred, not silently dropped)

- Fine-tuning breed/pose/coat classifiers on a real labeled dataset — as of
  Milestone 3, these run via CLIP zero-shot instead (see §4 above for the
  full reasoning). `models/registry.py`'s `get_breed_classifier()` remains
  as the documented upgrade path: swapping `breed.py` to call a real
  fine-tuned checkpoint instead of CLIP, once one exists, is a localized
  change — callers of `classify_breed()` never need to know which approach
  is behind it.
- LLM-assisted lore flavor pass (see `01-system-architecture.md` §6) — deferred,
  template engine ships first since it's fully testable without API cost/latency.
