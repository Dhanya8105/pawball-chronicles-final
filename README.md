# PawBall Chronicles

> Every Cat Has A Legend.

**Status: Milestone 3 — Computer Vision complete**, with a significant
caveat worth reading before relying on it: the development sandbox this
was built in has no network access to any model-weight host (HuggingFace,
GitHub release assets, PyTorch's CDN — all confirmed unreachable). The CV
pipeline is fully implemented with real libraries and fails loudly (clear
503, never fake data) when weights aren't present. **You need to run
`scripts/download_models.sh` once, on a machine with normal internet
access, before the CV pipeline produces real results.** See
`CHANGELOG.md` for the full, specific breakdown of what's verified vs.
what needs your machine to confirm.

## Quick start (local, no Docker)

Requires Node.js ≥ 20, Python ≥ 3.11, MongoDB, and Redis.

```bash
# from repo root
npm install
cp .env.example apps/api/.env        # fill in real values
cp .env.example apps/web/.env.local
npm run dev
```

### Setting up the AI service (CV pipeline)

```bash
cd services/ai
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# One-time: download real model weights (needs normal internet access —
# see this script's header comment for exactly which hosts are required
# and why this can't be automatic in every environment)
cd ..
./scripts/download_models.sh

cd services/ai
uvicorn app.main:app --reload   # http://localhost:8000/health
```

Without running `download_models.sh`, `services/ai` still starts and
`/health` still works — but `POST /cv/analyze` will return a `503` with a
message telling you exactly which weight is missing and how to fix it. This
is intentional: the service never fabricates a CV result.

### Redis

```bash
# Debian/Ubuntu
sudo apt install redis-server
sudo systemctl start redis-server
# or just: redis-server --daemonize yes
```

The capture pipeline's BullMQ queue needs Redis to be reachable at
`REDIS_URL` (default `redis://localhost:6379`) — without it, capture
uploads will still succeed (the photo gets stored) but the analyze job
will fail to enqueue.

## Running the tests

```bash
# apps/api
npm run test --workspace=apps/api       # full suite, needs MongoDB binary download
npm run test:unit --workspace=apps/api  # MongoDB-independent subset — this
                                         # is what was verified in this
                                         # project's own development sandbox,
                                         # including 4 tests against a real
                                         # local Redis instance

# services/ai
cd services/ai
python3 -m pytest tests/ -v             # all 18 tests are model-weight-
                                         # independent and should pass
                                         # without running download_models.sh
```

## Quick start (Docker)

```bash
cp .env.example .env
./scripts/download_models.sh   # populates ./model_cache, mounted into the ai container
cd infra/docker
docker compose build
docker compose up
```

**Note, carried over from previous milestones:** the Docker path is
configured and statically validated but has not been executed end-to-end
in this development environment (no Docker daemon available here). Please
run `docker compose build` yourself and report back if anything surfaces.

## Environment variables

See the annotated `.env.example` at the repo root. New in this milestone:

| Variable | Used by | Required? |
|---|---|---|
| `REDIS_URL` | apps/api | **Yes, as of this milestone** — the capture pipeline's BullMQ queue needs it |
| `MODEL_CACHE_DIR` | services/ai | No (defaults to `./model_cache`) — populate it via `scripts/download_models.sh` |
| `AI_SERVICE_URL` | apps/api | Yes — defaults to `http://localhost:8000`, must point at a running `services/ai` |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs `apps/web` + `apps/api` (now including the BullMQ worker) concurrently |
| `npm run build` | Builds `shared-types` → `apps/web` → `apps/api` |
| `npm run lint` | Lints both apps |
| `npm run test:unit --workspace=apps/api` | MongoDB-independent tests, including real-Redis BullMQ tests |
| `./scripts/download_models.sh` | One-time model weight download (needs normal internet access) |

## Repo layout

```
apps/
  web/      Next.js 15 PWA
  api/      Express backend — now with BullMQ queue + worker (src/queues/, src/jobs/)
services/
  ai/       FastAPI AI service — now with a real CV pipeline (app/pipelines/cv/)
scripts/
  download_models.sh   one-time model weight setup (NEW this milestone)
docs/
  architecture/   03-ai-pipeline.md and 04-api-contracts.md updated this milestone
infra/
  docker/   docker-compose.yml now mounts a model_cache volume for the ai service
```

## What's implemented vs. designed-but-not-yet-built

**Implemented this milestone:**
- Real YOLOv8 cat detection with real confidence scores
- Real CLIP zero-shot classification for breed, pose, coat, age,
  facial features, and surroundings (see `CHANGELOG.md` for why
  zero-shot rather than the originally-specified fine-tuned classifiers)
- A tail-visibility heuristic that honestly returns no confidence value
- The full `/cv/analyze` endpoint, with a clean 503 (never fake data)
  when models aren't downloaded
- BullMQ queue + worker wiring the capture pipeline's `pending_analysis →
  analyzed | failed` transition for real

**Carried over from previous milestones, untouched:**
- Auth, MongoDB persistence, Cloudinary upload (Milestone 2)
- The swappable `ImageGenerationProvider` (Milestone 1/architecture phase)

**Not yet built:** Aura/Lore/Region/Bond/Weekly-Life engines, the
generating_art → complete pipeline stages, the map and collection UI, real
FLUX/SDXL artwork generation, production hardening, and (within this
milestone's own scope) a real fine-tuned breed classifier and an SSE
alternative to capture-status polling.

## Next milestone

**Milestone 4 — Environment Intelligence**: extending the surroundings
classification into a structured environment profile (combining CV
surroundings labels with weather/time-of-day data), and persisting it per
capture for the Region Engine (Milestone 5+) to consume. Awaiting approval
to proceed per the iteration process.
