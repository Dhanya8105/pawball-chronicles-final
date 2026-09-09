# PawBall Chronicles

> Every Cat Has A Legend.

A mobile-first PWA cat-collection game: photograph a cat, and the Chronicle
turns it into a collectible RPG legend — bonded to where and when you found
it. Pokémon GO meets a trading-card game.

---

## Quick start

**Requirements:** Node 20+, Docker, Python 3.11+ (for `services/ai` — or run it
in Docker via the full-stack compose file below).

### 1. Infra — MongoDB + Redis

```bash
cd infra/docker && docker compose up -d mongo redis
```

### 2. API → http://localhost:4000

```bash
cd apps/api
cp .env.example .env
npm install && npm run dev
```

Starts the Express API, the BullMQ analyze-capture worker, and the weekly-life
worker in one process. Needs Mongo up (step 1); Redis is used by the queues
(without it the HTTP server still boots — capture enqueues just fail loudly).

### 3. AI service — Gemini Vision CV → http://localhost:8000

```bash
cd services/ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add GEMINI_API_KEY — optional (see below)
uvicorn app.main:app --reload --host 0.0.0.0
```

(`--host 0.0.0.0` so `apps/api`'s worker can reach it — the default
`127.0.0.1` bind can be missed by Node's `localhost` → IPv6 resolution.)

**CV is Google Gemini Vision** — `POST /cv/analyze` sends the image to
`gemini-3.6-flash` (override with `GEMINI_MODEL`) and returns a structured
`CvAnalysisResult`. **No model weights to download.** Get a free key at
<https://aistudio.google.com/app/apikey>. Without a `GEMINI_API_KEY` the
endpoint returns a clearly-labelled mock (`"mock": true`, all confidences
`0.0`, breed `"Domestic Shorthair"`) so the capture → bond → lore pipeline
still runs end-to-end in local dev.

### 4. Web → http://localhost:3000

```bash
cd apps/web
cp .env.local.example .env.local
npm install && npm run dev
```

---

## What works

- **Auth** — register / login / JWT access + refresh (rotation + revocation)
- **Cat capture → Gemini Vision CV → deterministic RPG identity** — upload a
  photo, poll the pipeline, get a collectible card. Region → Bond → Aura →
  Lore all run in `apps/api` as rule tables + a seeded RNG (no LLM), so the
  same encounter always produces the same legend.
- **Collection** — server-side search / filter (rarity, breed, bond level) /
  sort, with a bond progress bar and a bottom-sheet card detail
- **Map** — Leaflet with rarity-coloured circle markers, viewport-scoped
  (`bbox`) marker fetch
- **Journal** — per-PawBall memory timeline: discovered / bond-unlock /
  weekly-life entries
- **Weekly life tick** — BullMQ repeatable job (Mondays 06:00) appends one
  `weekly_life` memory per PawBall, idempotent per ISO week

## What needs real credentials to fully function

| Variable | Used by | Without it |
|---|---|---|
| `GEMINI_API_KEY` | `services/ai` | `POST /cv/analyze` returns a labelled **mock** `CvAnalysisResult` (`mock: true`). The pipeline runs; every capture just becomes a "Domestic Shorthair" with 0-confidence readings. Free key: <https://aistudio.google.com/app/apikey>. |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | `apps/api` | The capture upload step returns **`503 CAPTURE_PIPELINE_FAILED`** ("Image storage is not configured"). There is **no local-disk fallback** — capture needs Cloudinary. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | `apps/api` | `POST /auth/google` returns `503`. Email/password auth is unaffected. |

---

## Running the tests

```bash
# apps/api — needs a local Redis for the 4 real-queue tests; the Mongo-backed
# integration tests (auth.test.ts, capture.test.ts, analyzeCapture.worker.test.ts)
# download a mongod binary via mongodb-memory-server on first run.
cd apps/api
npm run test          # full suite
npm run test:unit     # Mongo-independent subset (+ real-Redis queue tests)

# services/ai — no API key needed (mock path + pure helpers)
cd services/ai && python3 -m pytest -q

# type-check / lint
npm run build --workspace=packages/shared-types
cd apps/api && npx tsc --noEmit && npm run lint
cd apps/web && npx tsc --noEmit && npm run build
```

## Quick start (Docker, full stack)

```bash
cp .env.example .env          # fill GEMINI_API_KEY + CLOUDINARY_* + JWT secrets
cd infra/docker
docker compose build
docker compose up
```

Brings up Mongo, Redis, `services/ai`, `apps/api`, and `apps/web` together.
The `ai` image no longer bundles PyTorch/CLIP, so the build is small.

## Environment variables

Annotated master list: `.env.example` at the repo root. Per-service copies:
`apps/api/.env`, `apps/web/.env.local`, `services/ai/.env`.

| Variable | Service | Required? |
|---|---|---|
| `MONGO_URI` | apps/api | Yes |
| `REDIS_URL` | apps/api | Yes (queues) — HTTP still boots without it |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | apps/api | Yes |
| `AI_SERVICE_URL` | apps/api | Yes — defaults to `http://localhost:8000` |
| `CLOUDINARY_*` | apps/api | Needed for capture upload (no fallback) |
| `GEMINI_API_KEY` | services/ai | Optional — mock CV without it |
| `NEXT_PUBLIC_API_URL` | apps/web | Yes — defaults to `http://localhost:4000/api/v1` |

## Repo layout

```
apps/
  web/      Next.js 15 PWA — capture / collection / map / journal, 430px mobile shell
  api/      Express + TS — auth, capture pipeline, Region/Bond/Aura/Lore engines,
            read APIs (pawballs / collection / map), BullMQ workers
services/
  ai/       FastAPI — CV via Gemini Vision (app/services/vision_cv.py),
            swappable image-generation provider (placeholder by default)
packages/
  shared-types/   the API contract, consumed by both apps
infra/
  docker/   docker-compose.yml — full local stack
docs/
  architecture/   system / data-schema / ai-pipeline / api-contracts
```

## Architecture notes

- **Deterministic engines, not LLM black boxes.** Region, Bond, Aura, and Lore
  are rule tables + a seeded mulberry32 RNG in `apps/api/src/modules/`. The
  seed is `sha256(userId | capturedAt | breed | coatColor)`, so a capture is
  fully reproducible and unit-testable. The only model call in the system is
  `services/ai`'s Gemini Vision CV.
- **Bond re-identification** currently matches on owner + breed + coat within
  ~250m of a prior sighting (documented interim for a future CLIP-embedding +
  FAISS service).
- **Artwork** is the original capture photo for now; the swappable
  `ImageGenerationProvider` (ComfyUI / SDXL / placeholder) is wired but real
  FLUX/SDXL generation is a later milestone.
