# PawBall Chronicles

> Every Cat Has A Legend.

A mobile-first PWA cat-collection game: photograph a cat, and the Chronicle
turns it into a collectible RPG legend — bonded to where and when you found
it. Pokémon GO meets a trading-card game.

---

## Quick start

Requirements: Node 20+, Python 3.11+, Docker

### 1. Start Mongo + Redis

```bash
cd infra/docker && docker compose up -d mongo redis
```

### 2. AI service

```bash
cd services/ai
cp .env.example .env
# Add GEMINI_API_KEY from aistudio.google.com (free)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

*If `apps/api`'s worker logs connection-refused / timeouts reaching the AI
service, start uvicorn with `--host 0.0.0.0` (Node resolves `localhost` to
IPv6 first).*

### 3. API

```bash
cd apps/api
cp .env.example .env
# Add CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET
npm install && npm run dev   # → :4000
```

### 4. Web

```bash
cd apps/web
cp .env.local.example .env.local
npm install && npm run dev   # → :3000
```

## Credentials needed

| Key | Where to get | Free? |
|-----|-------------|-------|
| GEMINI_API_KEY | aistudio.google.com/app/apikey | Yes |
| CLOUDINARY_* | cloudinary.com dashboard | Yes |
| JWT_SECRET | any random string | n/a |

Without `GEMINI_API_KEY`, `POST /cv/analyze` returns a labelled mock
(`"mock": true`, 0-confidence) so the pipeline still runs. Without
`CLOUDINARY_*`, the capture upload step returns `503` — there is no local
fallback.

## What works end-to-end

- Auth (register / login / JWT refresh)
- Cat capture → Gemini Vision CV → deterministic RPG identity
- Real breed, coat, pose, surroundings drive rarity/element/region/lore
- Collection with rarity filter + bond progression
- Map with Leaflet + rarity-coloured markers
- Journal with timeline (discovered / bond / weekly life)
- Weekly life tick job (BullMQ, Mondays 06:00)
- Cloudinary image storage

---

## Running the tests

```bash
# apps/api — auth.test.ts / capture.test.ts download a mongod via
# mongodb-memory-server on first run. No Redis needed for `npm test`.
cd apps/api
npm test              # 42 tests, 7 files — Redis-independent
npm run test:unit     # Mongo-independent subset
npm run test:integration   # queueMechanics + analyzeCapture.worker — real
                           # BullMQ + Redis on 127.0.0.1:6379 (the worker one
                           # is flaky under Vitest; run on demand)

# services/ai — no API key needed (mock path + pure helpers)
cd services/ai && python -m pytest -q

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
| `REDIS_URL` | apps/api | **Optional.** Unset/empty → background workers (capture analysis, weekly-life schedule) don't start; all HTTP routes and capture upload still work, captures stay `pending_analysis`. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | apps/api | Yes |
| `AI_SERVICE_URL` | apps/api | Yes — defaults to `http://localhost:8000` |
| `CLOUDINARY_*` | apps/api | Needed for capture upload (no fallback) |
| `GEMINI_API_KEY` | services/ai | Optional — mock CV without it |
| `GEMINI_MODEL` | services/ai | Optional — defaults to `gemini-flash-lite-latest` |
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
- **CV vocabulary is pinned.** The Gemini prompt constrains `coat.color` and
  `surroundings` to fixed lists that match the engine lookup tables exactly,
  so the CV reading drives class / element / rarity / region instead of
  falling through to defaults.
- **Bond re-identification** currently matches on owner + breed + coat within
  ~250m of a prior sighting (documented interim for a future CLIP-embedding +
  FAISS service).
- **Artwork** is the original capture photo for now; the swappable
  `ImageGenerationProvider` (ComfyUI / SDXL / placeholder) is wired but real
  FLUX/SDXL generation is a later milestone.
