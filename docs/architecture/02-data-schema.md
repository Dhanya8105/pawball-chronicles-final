# PawBall Chronicles — Data Schema (MongoDB)

Mongoose-style schemas. Collections, not exhaustive field lists — focus is on
relationships and the *why* behind denormalization choices, since those choices
drive query performance for map/collection views.

## Collections

### `users`
```ts
{
  _id: ObjectId,
  email: string,            // unique, indexed
  passwordHash: string | null,   // null if Google-OAuth-only account
  googleId: string | null,       // indexed, sparse
  displayName: string,
  avatarUrl: string | null,
  createdAt: Date,
  lastLoginAt: Date,
  settings: {
    units: 'metric' | 'imperial',
    notificationsEnabled: boolean,
    weeklyDigestEnabled: boolean,
  }
}
```

### `refresh_tokens` — added in Milestone 2
The API contract (`04-api-contracts.md`) requires `/auth/refresh` to "rotate"
and `/auth/logout` to "revoke" a refresh token. Neither is possible with a
stateless JWT alone — the server needs to know which refresh tokens are
currently valid so it can invalidate one on rotation/logout. Hence a small
dedicated collection rather than only trusting client-held tokens:

```ts
{
  _id: ObjectId,
  userId: ObjectId,          // indexed, ref users
  tokenHash: string,         // sha256 of the actual refresh token; never
                              // store the raw token, same principle as
                              // password hashing — a DB read shouldn't hand
                              // out a usable credential
  expiresAt: Date,           // indexed (TTL index — Mongo auto-expires)
  createdAt: Date,
  revokedAt: Date | null,    // set on logout or on rotation (old token dies
                              // the instant a new one is issued)
}
```
Indexes: `{ userId: 1 }`, `{ tokenHash: 1 }` unique, `{ expiresAt: 1 }` as a
TTL index (`expireAfterSeconds: 0`) so expired rows are reaped automatically
rather than accumulating forever.

### `pawballs`  — the persistent creature identity
This is the core aggregate. One document per *unique real-world cat* the user has
ever captured (not one per photo — that's what `sightings` is for).

```ts
{
  _id: ObjectId,
  ownerId: ObjectId,            // indexed, ref users
  faceEmbeddingId: string,      // FAISS vector ID, owned by services/ai
  identity: {
    fantasyName: string,
    title: string,              // "Guardian of Whisperleaf"
    class: string,               // "Rogue" | "Mage" | "Guardian" | ...
    rarity: 'common'|'uncommon'|'rare'|'epic'|'legendary',
    element: string,             // "Moon" | "Solar" | "Storm" | ...
  },
  visualProfile: {               // last-known confirmed CV reading, used as the
                                  // canonical reference for re-identification UI
    breed: string,
    breedConfidence: number,     // 0-1, NEVER fabricated — see ai-pipeline.md
    coatColor: string,
    coatPattern: string,
    estimatedAgeGroup: 'kitten'|'adult'|'senior',
  },
  abilities: {
    passive: { name: string, description: string },
    ultimate: { name: string, description: string },
  },
  aura: {
    traits: string[],            // ["Dream Affinity", "Guardian Instinct"]
    derivedFrom: [                // explainability — required by Aura Engine spec
      { trait: string, sourceFeature: string, sourceValue: string }
    ]
  },
  bond: {
    level: 'stranger'|'acquaintance'|'friend'|'trusted_companion'|'guardian'|'legend',
    levelNumeric: number,        // 0-5, drives progress bar UI
    sightingCount: number,
    firstSeenAt: Date,
    lastSeenAt: Date,
  },
  artwork: {
    currentImageUrl: string,     // Cloudinary URL, latest generated art
    history: [{ url: string, generatedAt: Date, providerUsed: string }]
  },
  originalPhotoUrl: string,      // first capture's original photo
  favoriteRestingPlace: { lat: number, lng: number, label: string } | null,
  titlesEarned: [{ title: string, earnedAt: Date, reason: string }],
  locationsVisited: [ObjectId],  // ref regions, deduped
  createdAt: Date,
  updatedAt: Date,
}
```

Indexes: `{ ownerId: 1, 'bond.lastSeenAt': -1 }` (collection view, recency sort),
`{ ownerId: 1, 'identity.rarity': 1 }`, `{ 'visualProfile.breed': 1 }`.

### `sightings` — one per individual capture event (append-only)
```ts
{
  _id: ObjectId,
  pawballId: ObjectId,       // indexed, ref pawballs — null until bond resolution completes
  ownerId: ObjectId,          // indexed
  captureId: ObjectId,        // ref captures, 1:1
  location: {
    type: 'Point',
    coordinates: [lng, lat]   // GeoJSON — enables $geoNear for map queries
  },
  regionId: ObjectId,         // ref regions
  capturedAt: Date,
  weatherSnapshot: { condition: string, tempC: number } | null,
  cvSnapshot: { ... },        // frozen copy of CV output at capture time
                               // (visualProfile on pawball can drift/improve;
                               // this is the historical record)
}
```
Indexes: `{ location: '2dsphere' }` (required for map + nearby queries),
`{ pawballId: 1, capturedAt: -1 }`.

**Why `sightings` is separate from `pawballs`:** the Bond System and Weekly Life
Engine both need an append-only event log (every sighting, every weekly journal
tick) while `pawballs` holds current aggregate state. Mixing these would mean
every sighting bloats the main document indefinitely. Sightings has its own
collection so collection-view queries (which only need current PawBall state)
stay fast regardless of how many times a cat has been seen.

### `captures` — pipeline lifecycle tracking for one upload
```ts
{
  _id: ObjectId,
  ownerId: ObjectId,
  status: 'pending_analysis'|'analyzed'|'generating_art'|'complete'|'failed',
  originalImageUrl: string,
  cvResult: { ... } | null,           // raw output from services/ai /cv/analyze
  bondResult: { pawballId, isNewPawball, similarityScore } | null,
  generatedArtUrl: string | null,
  error: { stage: string, message: string } | null,
  createdAt: Date,
  completedAt: Date | null,
}
```
This is the state machine apps/api/modules/capture drives. Kept separate from
`sightings` because a capture can fail mid-pipeline — we don't want partial/failed
attempts polluting the permanent sighting history.

### `regions` — fantasy-region mapping cache
```ts
{
  _id: ObjectId,
  ownerId: ObjectId,                  // regions are per-user (same coords could
                                       // get different lore for different users,
                                       // and avoids cross-user data leakage)
  realLocationHash: string,            // indexed — geohash-truncated key, so nearby
                                       // coords reuse the same fantasy region
  centerPoint: { type: 'Point', coordinates: [lng, lat] },
  fantasyName: string,                 // "Golden Lion Citadel"
  description: string,
  firstDiscoveredAt: Date,
}
```
Indexes: `{ ownerId: 1, realLocationHash: 1 }` unique — this is what makes
"never repeat regions unnecessarily" enforceable without an LLM call on every
single capture: nearby real coordinates hash to the same region deterministically.

### `memories` — weekly life engine + bond-unlocked narrative entries
```ts
{
  _id: ObjectId,
  pawballId: ObjectId,        // indexed
  ownerId: ObjectId,
  type: 'weekly_life'|'bond_unlock'|'title_earned'|'seasonal_event',
  text: string,
  occurredAt: Date,           // the in-fiction date this memory represents
  createdAt: Date,            // when the job actually ran
}
```
Indexes: `{ pawballId: 1, occurredAt: -1 }`.

## Relationship summary

```
User 1───* PawBall 1───* Sighting 1───1 Capture
              │                │
              │                └──* (regionId) Region
              └──* Memory
```

## Why this shape supports the spec's hardest requirement: Bond resolution

"Repeated sightings should recognize the same real cat... do not create duplicate
companions." This requires, on every new capture:

1. `services/ai` computes a CLIP embedding for the new photo.
2. `services/ai` queries its FAISS index scoped to `ownerId` (cats are matched
   per-user, not globally — two different users' orange tabbies are different
   PawBalls) and returns the nearest existing embedding + similarity score.
3. `apps/api/modules/bond` applies a similarity threshold:
   - Above threshold → existing `pawballId`, increment `bond.sightingCount`,
     append `sightings` doc, possibly bump `bond.level` via state machine,
     possibly emit `bond.levelUp` → triggers a `memories` entry of type
     `bond_unlock`.
   - Below threshold → new `pawballs` doc created, embedding registered in
     FAISS under the new `pawballId`.

This is why `pawballs.faceEmbeddingId` exists as a pointer rather than storing
the vector in Mongo: vector similarity search belongs in FAISS (or a vector DB),
not in MongoDB queries.
