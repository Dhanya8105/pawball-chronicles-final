# PawBall Chronicles

> Every Cat Has A Legend.

A mobile-first PWA cat-collection game: photograph a cat, and the Chronicle
turns it into a collectible RPG legend — bonded to where and when you found
it. Pokémon GO meets a trading-card game.

Three parts: **apps/web** (Next.js 15 PWA), **apps/api** (Express + TS — auth,
the capture pipeline, the deterministic Region/Bond/Aura/Lore engines, and
in-process Gemini Vision CV), and **packages/shared-types** (the API
contract). No separate AI service.

---

## Quick start

Requirements: Node 20+, Docker

### 1. Start Mongo + Redis

```bash
cd infra/docker && docker compose up -d mongo redis
```

### 2. API → :4000

```bash
cd apps/api
cp .env.example .env
# Add GEMINI_API_KEY (aistudio.google.com/app/apikey — free) and
# CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET
npm install && npm run dev
```

### 3. Web → :3000

```bash
cd apps/web
cp .env.local.example .env.local
npm install && npm run dev
```

## Credentials needed

| Key | Where to get | Free? |
|-----|-------------|-------|
| GEMINI_API_KEY | aistudio.google.com/app/apikey | Yes |
| CLOUDINARY_* | cloudinary.com dashboard | Yes |
| JWT_SECRET / JWT_REFRESH_SECRET | any random strings | n/a |

Without `GEMINI_API_KEY`, the CV step (`modules/capture/cv.service.ts`)
returns a labelled mock (`"mock": true`, 0-confidence), and the lore step
(`modules/lore/lore.gemini.ts` — origin lore, personality, weekly updates)
falls back to its seeded template pools — so the pipeline still runs fully
offline. Without `CLOUDINARY_*`, the capture upload step returns `503` —
there is no local fallback. `REDIS_URL` is optional: unset it and the API
still boots and serves every route, but the BullMQ workers don't run
(captures stay `pending_analysis`, weekly-life is manual-only via
`runWeeklyLifeTick()`).

## What works end-to-end

- Auth (register / login / JWT refresh)
- Cat capture → in-process Gemini Vision CV → deterministic RPG identity
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
npm test              # 46 tests, 7 files — Redis-independent
npm run test:unit     # Mongo-independent subset
npm run test:integration   # queueMechanics — real BullMQ + Redis on
                           # 127.0.0.1:6379. (analyzeCapture.worker.test.ts
                           # is .skip'd — see its header.)

# type-check / lint
npm run build --workspace=@pawball/shared-types
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

Brings up Mongo, Redis, `apps/api`, and `apps/web`.

## Environment variables

Annotated master list: `.env.example` at the repo root. Per-service copies:
`apps/api/.env`, `apps/web/.env.local`.

| Variable | Service | Required? |
|---|---|---|
| `MONGO_URI` | apps/api | Yes |
| `REDIS_URL` | apps/api | **Optional** — unset/empty disables the BullMQ workers; all HTTP routes and capture upload still work, captures stay `pending_analysis` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | apps/api | Yes |
| `CLOUDINARY_*` | apps/api | Needed for capture upload (no fallback) |
| `GEMINI_API_KEY` | apps/api | Optional — mock CV and templated lore without it |
| `GEMINI_MODEL` | apps/api | Optional — defaults to `gemini-flash-lite-latest` |
| `GOOGLE_CLIENT_ID` / `_SECRET` | apps/api | Optional — only for `POST /auth/google` |
| `NEXT_PUBLIC_API_URL` | apps/web | Yes — defaults to `http://localhost:4000/api/v1` |

## Repo layout

```
apps/
  web/      Next.js 15 PWA — capture / collection / map / journal, 430px mobile shell
  api/      Express + TS — auth, capture pipeline (incl. Gemini Vision CV in
            modules/capture/cv.service.ts), Region/Bond/Aura/Lore engines,
            read APIs (pawballs / collection / map), BullMQ workers
packages/
  shared-types/   the API contract, consumed by both apps
infra/
  docker/   docker-compose.yml — Mongo + Redis + api + web
docs/
  architecture/   system / data-schema / ai-pipeline / api-contracts
```

## Architecture notes

- **Deterministic engines, with one intentional exception: prose.** Region,
  Bond, Aura, name, class, element, rarity, stats and abilities are all rule
  tables + a seeded mulberry32 RNG in `apps/api/src/modules/`. The seed is
  `sha256(userId | capturedAt | breed | coatColor)`, so all of that is fully
  reproducible and unit-testable regardless of what happens with Gemini.
  The one thing that isn't: a PawBall's `loreText` + `personality`, and its
  weekly life-update sentence, are real Gemini calls
  (`modules/lore/lore.gemini.ts`) — a template pool can't write text that's
  actually specific to one cat. Both fall back to the old seeded-template
  pools if `GEMINI_API_KEY` is unset or the call fails after retries, so a
  capture or a weekly-life run never hard-fails on flavor text. The other
  model call in the system is the Gemini Vision CV in
  `modules/capture/cv.service.ts` — both are direct REST calls, no SDK, no
  separate service.
- **CV vocabulary is pinned.** The Gemini prompt constrains `coat.color` and
  `surroundings` to fixed lists that match the engine lookup tables exactly,
  so the CV reading drives class / element / rarity / region instead of
  falling through to defaults.
- **Bond re-identification** currently matches on owner + breed + coat within
  ~250m of a prior sighting (documented interim for a future CLIP-embedding +
  FAISS approach).
- **Artwork** is the original capture photo for now; real FLUX/SDXL
  generation is a later milestone.
