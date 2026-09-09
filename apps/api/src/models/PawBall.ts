/**
 * apps/api/src/models/PawBall.ts
 *
 * The core game aggregate — one document per *unique real-world cat* a user
 * has ever captured (not one per photo; that's `sightings`). Matches
 * docs/architecture/02-data-schema.md `pawballs`, with three additions the
 * fantasy engines (Milestone 4/5) need:
 *
 *   - `stats`      — the five card stats, produced by modules/lore.
 *   - `loreText`   — the creature's origin lore paragraph, produced by
 *                     modules/lore. Weekly *updates* are separate `memories`
 *                     docs; this is the fixed origin text.
 *   - `homeRegion` — denormalized `{ regionId, name }` of the region the
 *                     PawBall was first discovered in, so the collection and
 *                     map read models don't need a `$lookup` per row for the
 *                     region name.
 *
 * `identity`, `aura`, `abilities`, `stats` are populated once, at creation,
 * by `modules/capture/capture.pipeline.ts`. `bond` and `locationsVisited`
 * are updated on every subsequent sighting of the same cat.
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const identitySchema = new Schema(
  {
    fantasyName: { type: String, default: "" },
    title: { type: String, default: "" },
    class: { type: String, default: "" },
    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "epic", "legendary"],
      default: "common",
    },
    element: { type: String, default: "" },
  },
  { _id: false }
);

const visualProfileSchema = new Schema(
  {
    breed: { type: String, default: "unknown" },
    breedConfidence: { type: Number, default: null },
    coatColor: { type: String, default: "unknown" },
    coatPattern: { type: String, default: "unknown" },
    estimatedAgeGroup: {
      type: String,
      enum: ["kitten", "adult", "senior"],
      default: "adult",
    },
  },
  { _id: false }
);

const abilitySchema = new Schema(
  { name: { type: String, default: "" }, description: { type: String, default: "" } },
  { _id: false }
);

const auraTraitSourceSchema = new Schema(
  {
    trait: { type: String, required: true },
    sourceFeature: { type: String, required: true },
    sourceValue: { type: String, required: true },
  },
  { _id: false }
);

const bondSchema = new Schema(
  {
    level: {
      type: String,
      enum: ["stranger", "acquaintance", "friend", "trusted_companion", "guardian", "legend"],
      default: "stranger",
    },
    levelNumeric: { type: Number, default: 0 },
    sightingCount: { type: Number, default: 1 },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { _id: false }
);

const statsSchema = new Schema(
  {
    attack: { type: Number, default: 50 },
    defense: { type: Number, default: 50 },
    agility: { type: Number, default: 50 },
    spirit: { type: Number, default: 50 },
    wisdom: { type: Number, default: 50 },
  },
  { _id: false }
);

const artworkHistorySchema = new Schema(
  {
    url: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    providerUsed: { type: String, required: true },
  },
  { _id: false }
);

const titleEarnedSchema = new Schema(
  {
    title: { type: String, required: true },
    earnedAt: { type: Date, required: true },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const homeRegionSchema = new Schema(
  {
    regionId: { type: Schema.Types.ObjectId, ref: "Region" },
    name: { type: String, default: "" },
  },
  { _id: false }
);

const pawballSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    faceEmbeddingId: { type: String, default: null },
    identity: { type: identitySchema, default: () => ({}) },
    visualProfile: { type: visualProfileSchema, default: () => ({}) },
    abilities: {
      type: new Schema({ passive: abilitySchema, ultimate: abilitySchema }, { _id: false }),
      default: () => ({}),
    },
    aura: {
      type: new Schema(
        {
          traits: { type: [String], default: [] },
          derivedFrom: { type: [auraTraitSourceSchema], default: [] },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    stats: { type: statsSchema, default: () => ({}) },
    loreText: { type: String, default: "" },
    bond: { type: bondSchema, required: true },
    artwork: {
      type: new Schema(
        {
          currentImageUrl: { type: String, default: "" },
          history: { type: [artworkHistorySchema], default: [] },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    originalPhotoUrl: { type: String, required: true },
    homeRegion: { type: homeRegionSchema, default: () => ({}) },
    favoriteRestingPlace: {
      type: new Schema({ lat: Number, lng: Number, label: String }, { _id: false }),
      default: null,
    },
    titlesEarned: { type: [titleEarnedSchema], default: [] },
    locationsVisited: { type: [Schema.Types.ObjectId], ref: "Region", default: [] },
  },
  { timestamps: true }
);

pawballSchema.index({ ownerId: 1, "bond.lastSeenAt": -1 });
pawballSchema.index({ ownerId: 1, "identity.rarity": 1 });
pawballSchema.index({ ownerId: 1, "visualProfile.breed": 1 });
pawballSchema.index({ ownerId: 1, "bond.level": 1 });

export type PawBallDocument = InferSchemaType<typeof pawballSchema> & {
  _id: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const PawBallModel: Model<PawBallDocument> = model<PawBallDocument>(
  "PawBall",
  pawballSchema
);
