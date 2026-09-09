# PawBall Chronicles — API Contracts (apps/web ↔ apps/api)

Base URL: `/api/v1`. All authenticated routes require `Authorization: Bearer <JWT>`.
Responses follow `{ success: boolean, data?: T, error?: { code: string, message: string } }`.

## Auth — `modules/auth`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, displayName }` | bcrypt hash, returns JWT pair |
| POST | `/auth/login` | `{ email, password }` | returns `{ accessToken, refreshToken }` |
| POST | `/auth/google` | `{ idToken }` | Google OAuth exchange |
| POST | `/auth/refresh` | `{ refreshToken }` | rotates refresh token |
| POST | `/auth/logout` | `{ refreshToken }` | revokes refresh token |
| GET | `/auth/me` | — (requires `Authorization`) | returns the current user's public profile; added in Milestone 2 for the dashboard shell |

## Capture — `modules/capture`

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/captures` | multipart: `image`, `lat`, `lng`, `capturedAt` | creates Capture, enqueues pipeline, returns `{ captureId, status: 'pending_analysis' }` immediately |
| GET | `/captures/:id` | — | poll for pipeline status: `pending_analysis → analyzed → generating_art → complete \| failed`. As of Milestone 3, `pending_analysis → analyzed \| failed` is real (a BullMQ worker calls services/ai's `/cv/analyze`); `generating_art → complete` await Milestone 6 (image generation wiring). |
| GET | `/captures/:id/stream` | — | SSE alternative to polling; emits same status transitions. **Not yet implemented** — Milestone 3 only added polling via the existing `GET /captures/:id`. |

Frontend flow: POST returns instantly so the capture screen can show an
"analyzing..." animation rather than blocking on a multi-second/minute request.

## PawBall — `modules/pawball`

| Method | Path | Notes |
|---|---|---|
| GET | `/pawballs/:id` | full PawBall detail: identity, aura, abilities, artwork, timeline |
| GET | `/pawballs/:id/timeline` | merged, time-ordered: sightings + memories, paginated |
| PATCH | `/pawballs/:id/favorite-resting-place` | `{ lat, lng, label }` — user-set, optional |
| GET | `/pawballs/:id/sightings` | raw sighting history, paginated |

## Bond — `modules/bond`
No direct frontend-facing routes — bond resolution happens internally as part of
the capture pipeline. Bond level/progress is exposed as a sub-object on the
PawBall GET response (`bond: { level, levelNumeric, sightingCount }`), not a
separate endpoint, since it's never fetched independently of the PawBall it
belongs to.

## Map — `modules/map`

| Method | Path | Query | Notes |
|---|---|---|---|
| GET | `/map/markers` | `bbox=lng1,lat1,lng2,lat2` | returns lightweight markers (pawballId, lat, lng, thumbnailUrl, rarity) within viewport, via `$geoNear`/bbox query on `sightings` |
| GET | `/map/markers/:pawballId` | — | full popup payload: photo, artwork, story snippet, timeline link |

Viewport-scoped (`bbox`) rather than "all markers," since a user's collection
can span an entire city/country over time — unbounded marker fetch would not
scale on the Leaflet frontend.

## Collection — `modules/collection`

| Method | Path | Query | Notes |
|---|---|---|---|
| GET | `/collection` | `q, sortBy, rarity, breed, regionId, bondLevel, page, pageSize` | server-side search/filter/sort/pagination over the user's PawBalls |
| GET | `/collection/stats` | — | counts by rarity/breed/region, for collection-screen header chips |

## Region — `modules/region`
No direct frontend routes — region resolution happens inside the capture
pipeline and the resulting `regionId`/`fantasyName` is embedded in the
Capture/Sighting/PawBall responses.

## Weekly Life — `modules/weeklyLife`

| Method | Path | Notes |
|---|---|---|
| GET | `/pawballs/:id/memories?type=weekly_life` | paginated, surfaced inside the PawBall timeline endpoint too |

The generation itself is a scheduled job (`apps/api/src/jobs/weeklyLifeTick.ts`,
triggered weekly via BullMQ repeatable job), not an HTTP-triggered action.

## Error codes (subset, extended as modules are built)

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | request body failed schema validation; `message` lists the issue(s) |
| `AUTH_INVALID_CREDENTIALS` | login failure |
| `AUTH_EMAIL_TAKEN` | registration attempted with an email already in use |
| `AUTH_TOKEN_EXPIRED` | needs refresh |
| `AUTH_TOKEN_INVALID` | malformed, unsigned, or revoked token |
| `AUTH_UNAUTHORIZED` | missing/invalid `Authorization` header on a protected route |
| `AUTH_GOOGLE_TOKEN_INVALID` | Google ID token failed verification |
| `CAPTURE_NOT_A_CAT` | CV confidently determined no cat present |
| `CAPTURE_LOW_CONFIDENCE` | cat detection confidence below threshold — frontend prompts retake |
| `CAPTURE_PIPELINE_FAILED` | generic pipeline failure, includes `stage` for debugging |
| `CAPTURE_IMAGE_REQUIRED` | `POST /captures` called without an `image` file part |
| `CAPTURE_NOT_FOUND` | capture id doesn't exist or doesn't belong to the requesting user |
| `RATE_LIMITED` | too many requests, includes `retryAfterSeconds` |
| `NOT_FOUND` | route doesn't exist |
| `INTERNAL_SERVER_ERROR` | unexpected error, detail withheld from the client response |

