# Changelog

## Milestone 3 — Computer Vision (this iteration)

**Goal:** a real Python FastAPI CV pipeline (YOLOv8, breed/coat/pose/age
classification, surroundings classification), exposed via `/cv/analyze`,
wired into the capture pipeline via BullMQ so the analysis happens in the
background. Read this entry in full before relying on the CV outputs —
there is a real, load-bearing constraint on what could be verified in this
development sandbox, explained below rather than glossed over.

### The central constraint, stated upfront

This sandbox's network access could not reach **any** model-weight host —
not HuggingFace, not GitHub release assets, not PyTorch's own CDN. All
three were checked directly (not assumed) and confirmed to return HTTP 403
from the network egress layer before any code was written. This means
**no pretrained computer vision model could be loaded or run against a
real photo in this sandbox**, regardless of which CV library was chosen.

Given that, the approach taken was: write the full real pipeline using
real libraries (ultralytics, transformers, torch — all genuinely
`pip install`-ed and imported, not mocked out), make model loading fail
loudly and clearly when weights are missing rather than fabricating
output, and provide a one-time setup script
(`scripts/download_models.sh`) for the user to run on a machine with
normal internet access. Every test that doesn't require actual model
weights was written AND run for real in this sandbox.

### Added — `services/ai`

- **`app/models/registry.py`** — lazy-loads and caches real model weights
  from a local `MODEL_CACHE_DIR`. Raises `ModelNotAvailableError` with an
  actionable message when weights are missing — never returns fabricated
  output. Covers `get_yolo_detector()`, `get_clip_model()`,
  `get_breed_classifier()` (the last one documented as currently
  unreachable — see "Breed classification" below).
- **`app/pipelines/cv/`** — the real CV pipeline:
  - `detection.py` — real YOLOv8 inference (ultralytics), COCO class 15
    ("cat"), returns real confidence + bounding box; `crop_to_subject`
    crops with a 10% margin, clamped to image bounds.
  - `breed.py`, `pose.py`, `coat.py`, `age.py`, `facial_features.py` — all
    implemented via **CLIP zero-shot classification**, not the
    fine-tuned-classifier approach the original brief described. See
    "Breed classification" and "Pose/coat/age" below for why, stated
    plainly in each module's own docstring too.
  - `surroundings.py` — CLIP zero-shot against the fixed 19-label set from
    the project brief, with a confidence threshold (0.05) and descending
    sort — this was always the intended approach for this field, not a
    fallback.
  - `facial_features.py`'s `detect_tail_visible` — a bounding-box-aspect-
    ratio heuristic, explicitly NOT a model call, returns a plain `bool`
    with no confidence value attached, per the "never invent confidence
    values" rule.
- **`app/services/cv_orchestrator.py`** — composes detection + all
  classifiers into the single `/cv/analyze` response; short-circuits
  (skips all downstream classifiers) when no cat is detected.
- **`app/routers/cv.py`** — `POST /cv/analyze`, wired into `main.py`.
  Returns a clean `503` with the registry's actionable message when
  models aren't available — never a `200` with fake data.
- **`app/schemas/cv_result.py`** — Pydantic schemas matching
  `docs/architecture/03-ai-pipeline.md`'s contract, enforcing the
  confidence-honesty rule at the type level (model-backed fields require
  `confidence: float`; only the no-model tail heuristic can omit it,
  because it returns a bare `bool`, not a confidence-bearing object at all).
- **18 real pytest tests** (`services/ai/tests/`) — model registry
  fail-loudly behavior, crop geometry, the tail heuristic, orchestrator
  control flow (mocked classifiers), and surroundings threshold/sort logic
  with a mocked CLIP forward pass. All run with genuinely installed
  torch/transformers/ultralytics — **all 18 pass**.
- **`scripts/download_models.sh`** — one-time setup step for a machine
  with normal internet access: downloads `yolov8n.pt` and a local CLIP
  ViT-B/32 snapshot into `MODEL_CACHE_DIR`.

### Added — `apps/api`

- **`src/queues/analyzeCaptureQueue.ts`** — BullMQ queue definition
  (3 attempts, exponential backoff, completed/failed job retention).
- **`src/jobs/analyzeCapture.ts`** — the worker: pulls a capture, calls
  `/cv/analyze`, writes the result back (`status: 'analyzed'`,
  `cvResult`), or — after BullMQ exhausts all retry attempts — writes
  `status: 'failed'` with `error: { stage: 'cv_analysis', message }`.
- **`src/lib/aiServiceClient.ts`** — typed HTTP client for the
  `apps/api → services/ai` call, converts the wire format's snake_case to
  camelCase, maps a `503` response to a distinct `AiServiceUnavailableError`
  (so the worker's retry logic can eventually distinguish "models aren't
  loaded yet, keep retrying" from "this will never succeed" — not yet
  acted on differently this milestone, but the type distinction is in
  place for when that logic is added).
- `capture.service.ts`'s `createCapture` now enqueues the analyze job
  after persisting the capture — the upload request still returns
  immediately (BullMQ enqueue is a fast Redis write, awaited so a
  Redis-unreachable error surfaces clearly rather than leaving a capture
  silently stuck forever).
- `src/index.ts` now starts the BullMQ worker alongside the HTTP server in
  the same process (a deliberate simplification flagged as a Milestone 10
  candidate to split into a separate worker process/container).
- **7 new tests**, two genuinely novel for this codebase:
  - `test/queueMechanics.test.ts` — **runs against a real local Redis
    instance** (this sandbox has `redis-server` installable via `apt`,
    unlike MongoDB, which has no available binary anywhere — see
    "What's actually verified" below for the full contrast). Tests real
    enqueue→pickup, retry-with-backoff, FIFO-per-worker ordering, and
    failed-event emission. **All 4 pass against real Redis.**
  - `test/aiServiceClient.test.ts` — snake→camel conversion and
    status-code-to-error-type mapping, with `fetch` mocked. **3/3 pass.**
  - `test/analyzeCapture.worker.test.ts` — full worker integration
    (real Redis + real BullMQ Worker + a Capture document), written to
    the same standard as the above but needs MongoDB (via
    `mongodb-memory-server`) for the Capture documents, so it inherits
    the same MongoDB-binary-download limitation as `auth.test.ts`/
    `capture.test.ts` from Milestone 2 — **written, not executed here.**

### Docs

- `docs/architecture/03-ai-pipeline.md` §4 rewritten to describe what's
  actually implemented (CLIP zero-shot throughout, with the reasoning),
  rather than the original speculative EfficientNet/dedicated-classifier
  plan. §6 updated to match.
- `docs/architecture/04-api-contracts.md`: clarified which capture status
  transitions are now real (`pending_analysis → analyzed`) vs. still
  pending Milestone 6 (`generating_art → complete`); flagged that the SSE
  endpoint (`GET /captures/:id/stream`) was never actually built — the
  doc had implied it existed, this corrects that.
- `infra/docker/docker-compose.yml`: added a `model_cache` volume mount
  for the `ai` service and `MODEL_CACHE_DIR` env var.

### Breed classification — a deliberate scope deviation from the original brief

The project brief asks for an EfficientNet classifier fine-tuned on a
labeled cat-breed dataset (naming the Oxford-IIIT Pet Dataset directly).
That remains the better long-term approach — breed differences are subtle
enough that supervised fine-tuning should outperform zero-shot prompting.
However, fine-tuning requires a training run, which this milestone's
environment cannot do (single CPU core, no GPU, and separately no network
path to even download a backbone to fine-tune from). Rather than leave
breed classification permanently blocked behind a checkpoint that will
never exist without dedicated training infrastructure, `breed.py` uses
CLIP zero-shot against a list of common breed names (plus "domestic
shorthair/longhair" catch-alls, since most real-world encountered cats
are mixed-breed). `models/registry.py`'s `get_breed_classifier()` and its
docstring remain as the documented upgrade path. **This is a real,
working implementation today — just a lower-accuracy interim approach
than originally specified, not a stub.**

### Pose / coat / age classification — same reasoning, smaller deviation

These were always going to need either a trained classifier or zero-shot;
the brief didn't specify which. Zero-shot CLIP was chosen for the same
reason as breed (no training infrastructure available) and is a smaller
deviation since these are coarser, more zero-shot-friendly distinctions
than breed identification.

### What's actually verified this session — be specific about this

**Genuinely run, not just written:**
- `services/ai`: torch 2.4.1, transformers 4.45.2, and ultralytics 8.3.0
  actually installed and imported in this sandbox (after working around a
  disk-space issue — see "Operational lesson" below). 18/18 pytest tests
  pass. The FastAPI app boots; `POST /cv/analyze` was hit with a real HTTP
  request end-to-end (test image bytes → PIL → YOLO load attempt → clean
  503 with the registry's actionable message, since no weights are
  downloaded). The same endpoint was also exercised with a malformed/
  unreachable image URL and correctly returned a 400.
- `apps/api`: 26/26 unit tests pass, including 4 against a **real local
  Redis** (genuinely installed via `apt`, genuinely running) covering
  real BullMQ enqueue/process/retry/failure mechanics — not mocked.
- Full root build (`shared-types` → `web` → `api`) and lint: clean.

**Written, structurally sound, but NOT executed in this sandbox:**
- `test/analyzeCapture.worker.test.ts` — needs MongoDB.
- `test/auth.test.ts`, `test/capture.test.ts` (carried over from
  Milestone 2, unchanged) — same reason.
- Actual CV inference accuracy against a real cat photo — needs
  `scripts/download_models.sh` run on a machine with normal internet
  access, then a manual check against real photos. The 503-when-missing
  path is verified; the 200-with-real-results path is not, because there
  are no real model weights in this sandbox to produce one.
- The full capture pipeline end-to-end through the real Express server
  (upload → enqueue → worker → real AI service → Capture updated) — this
  needs MongoDB, which isn't available here. What WAS verified separately:
  the AI-service HTTP call in isolation (Node script calling the real
  running FastAPI process directly, bypassing Mongo) and the BullMQ
  mechanics in isolation (real Redis, no Mongo). The piece that combines
  all three (Mongo + Redis + AI service through the real Express app) is
  the one genuinely missing link — recommend testing this specifically
  once you have MongoDB available.
- Docker (`docker compose build/up`) — same pre-existing limitation as
  Milestones 1-2, no Docker daemon in this sandbox.

### Operational lesson learned during this milestone (documented since it's a real, reusable finding)

Installing `torch` from PyPI directly works (the PyPI wheel bundles CUDA
libraries and is ~800MB even though only CPU execution is available/used
here) — `download.pytorch.org`'s CPU-specific wheel index is unreachable
in this sandbox, same as every other model-weight host. The first
`pip install torch ultralytics ...` attempt in one command ran out of
disk space, because `ultralytics`' loose `torch>=1.8.0` constraint let
pip's resolver pull a *second*, newer torch (with CUDA 13 wheels) instead
of reusing the already-installed one. Installing torch and torchvision
first, then `ultralytics --no-deps` plus its two genuinely-missing small
deps (`ultralytics-thop`, confirmed via PyPI metadata that everything else
it wants was already present in this sandbox's base image), avoided this.
Documented in `services/ai/requirements.txt`'s own comment too, since this
is exactly the kind of thing that could bite a real deployment's Docker
build if not anticipated.

### Carried forward unchanged from Milestone 2

All auth, persistence, and Milestone 2 capture-upload code is untouched.
The known limitations documented in Milestone 2's changelog entry
(MongoDB integration tests unexecuted, Google OAuth untested, Docker
unexecuted, the `uuid`/`gaxios` audit finding) still apply and are not
repeated in full here — see the previous changelog entry (preserved in
git history / the Milestone 2 deliverable) for those details.
