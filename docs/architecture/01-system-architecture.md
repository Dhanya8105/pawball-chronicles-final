# PawBall Chronicles — System Architecture

## 1. Service Topology

Three independently deployable services, one shared-contract layer:

```
┌─────────────────┐      HTTPS/REST       ┌──────────────────┐
│   apps/web       │ ───────────────────▶ │   apps/api        │
│   Next.js 15 PWA │ ◀─────────────────── │   Node/Express/TS │
└─────────────────┘      JSON + JWT       └──────────────────┘
                                                     │
                                       internal HTTP │ (service-to-service,
                                       not exposed   │  not browser-reachable)
                                                     ▼
                                          ┌──────────────────────┐
                                          │   services/ai          │
                                          │   Python / FastAPI      │
                                          │   CV + Embeddings +     │
                                          │   ImageGen orchestration │
                                          └──────────────────────┘
                                                     │
                                          ┌──────────┴──────────┐
                                          ▼                     ▼
                                 GPU inference            ImageGenerationProvider
                                 (YOLOv8/CLIP/            (pluggable: ComfyUI/FLUX,
                                  EfficientNet, local)     SDXL, or Placeholder)
```

Why three services and not a monolith:

- **apps/api** owns business logic, auth, persistence, queues. It is the only service
  that talks to MongoDB/Redis directly and the only one the frontend ever calls.
- **services/ai** owns anything that needs PyTorch/CUDA. It is stateless — given an
  image (or image ref), it returns structured CV results, embeddings, or generated
  art. It never touches the database. This boundary means the AI service can be
  scaled on GPU infra independently of the API tier, and the heavy ML dependency
  surface (torch, transformers, diffusers) never has to live inside the Node process.
- **apps/web** never talks to services/ai directly — all AI calls are proxied/queued
  through apps/api so auth, rate limiting, and persistence stay centralized.

## 2. Why BullMQ / Redis queue sits in front of the AI service

Image generation (FLUX/SDXL via ComfyUI) takes seconds-to-minutes per image, and CV
inference is also non-trivial. Neither should block an HTTP request/response cycle.

Flow for a capture:

1. User uploads photo → `apps/api` stores original in Cloudinary, creates a
   `Capture` doc with `status: PENDING_ANALYSIS`, enqueues `analyze-capture` job.
2. Worker picks up job → calls `services/ai` `/cv/analyze` (sync, fast: <2s) →
   writes CV results to the `Capture` doc → enqueues `generate-artwork` job.
3. Worker picks up `generate-artwork` → calls `services/ai` `/imagegen/generate`
   (slow, async-internally) → polls or receives webhook → uploads result to
   Cloudinary → updates `Capture.status: COMPLETE` → emits `capture.completed`
   event (SSE/WebSocket to client, or client polls).
4. Bond resolution, Lore generation, and Aura derivation are synchronous,
   fast, deterministic-ish business logic — these run inside `apps/api`
   itself (modules/bond, modules/lore, modules/aura), not in the AI service,
   because they're not actually ML model calls — they're rule/template engines
   that *consume* the AI service's structured output.

This separation matters: **Aura, Lore, and Region engines are not LLM black boxes.
They are explainable, testable, versioned business logic** that map structured CV
output to RPG semantics via deterministic rule tables. They live in `apps/api` so
they can be unit-tested without any model dependency, and so their mappings can be
audited/tuned without redeploying the AI service. (An optional LLM-assisted lore
*flavor* pass can sit on top — see §6 — but the *structure* of lore is rule-driven.)

## 3. Module boundaries inside apps/api

Each module is self-contained: routes, controller, service, repository, validators,
tests. No module reaches into another module's repository directly — cross-module
communication goes through the other module's exported service interface, or through
domain events for fully decoupled flows (e.g., weekly-life doesn't need to know how
bond-level was computed, it just reacts to `bond.levelUp`).

```
modules/
  auth/         registration, login, Google OAuth, JWT issuance/refresh
  capture/      upload handling, capture lifecycle state machine, orchestrates
                the analyze→generate pipeline via queues
  pawball/      the PawBall aggregate: a creature's persistent identity,
                stats, story timeline, locations, titles
  bond/         same-cat re-identification (consumes embeddings from AI svc),
                relationship level state machine, memory unlocking
  aura/         deterministic trait-derivation engine (visual features → aura)
  region/       real-location → fantasy-region mapping engine
  lore/         lore text generation (template engine + optional LLM flavor pass)
  weeklyLife/   scheduled job: generates weekly journal entries per PawBall
  map/          read-side: geo-queries for the map view
  collection/   read-side: search/sort/filter over the user's PawBall collection
```

Each module exposes a narrow `index.ts` public interface. Example:
`bond` exposes `resolveBondForCapture(captureId): Promise<BondResult>` — nothing
else in the module is importable from outside.

## 4. AI service internal pipeline shape

```
services/ai/app/
  pipelines/cv/          detection.py, breed.py, pose.py, coat.py, age.py
  pipelines/embeddings/  clip_embed.py, faiss_index.py
  pipelines/imagegen/    provider.py (ABC), comfyui_provider.py,
                         placeholder_provider.py, prompt_builder.py
  routers/                cv.py, embeddings.py, imagegen.py
  services/              orchestrates pipelines, no business/RPG logic here
```

`pipelines/imagegen/provider.py` defines the swappable interface (detailed in
`03-ai-pipeline.md`). Swapping FLUX↔SDXL↔Placeholder is a config/env change, never
a code change in callers.

## 5. Data ownership

- MongoDB: source of truth for Users, PawBalls, Captures, Sightings, Memories,
  Regions, Titles — anything persistent and relational-ish (see `02-data-schema.md`).
- Redis: BullMQ queues, session/rate-limit counters, short-lived caches (e.g.
  region-name generation cache to avoid recomputation for nearby coordinates).
- FAISS index: lives inside `services/ai`, persisted to disk/volume, holds CLIP
  embeddings keyed by PawBall ID for same-cat re-identification. apps/api never
  queries FAISS directly — it asks services/ai "does this embedding match an
  existing PawBall for this user?" and gets back a PawBall ID + similarity score.
- Cloudinary: all binary image assets (original photos + generated artwork).

## 6. Where LLM-assisted generation fits (optional, not required for v1)

The Lore Engine's *structure* (which facts go into a lore entry: breed, region,
weather, pose, aura, season) is deterministic and template-based — this guarantees
every PawBall gets a coherent entry even with zero LLM cost, and keeps the system
testable. An optional later enhancement can pass the structured template output
through an LLM call for prose "flavor" polishing, gated behind the same
provider-interface pattern used for image generation, so the system works fully
offline/deterministically without it.

## 7. Environments & deployment shape

| Service       | Dev                  | Prod                          |
|---------------|----------------------|-------------------------------|
| apps/web      | `next dev`           | Vercel                        |
| apps/api      | `tsx watch`           | Railway/Render (Node container)|
| services/ai   | `uvicorn --reload`   | GPU VM (Docker)               |
| MongoDB       | local/Atlas dev tier | MongoDB Atlas                 |
| Redis         | local Docker         | Managed Redis (Railway/Upstash)|

All three services + Mongo + Redis run together via `infra/docker/docker-compose.yml`
for local development, so CV/imagegen can be exercised end-to-end before any cloud
GPU is provisioned (using the Placeholder image-gen provider locally).
