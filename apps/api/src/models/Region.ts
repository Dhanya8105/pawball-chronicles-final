/**
 * apps/api/src/models/Region.ts
 *
 * Matches docs/architecture/02-data-schema.md `regions` collection — the
 * fantasy-region mapping cache. Regions are per-user (the same real
 * coordinates can map to different lore for different players, and this
 * avoids cross-user data leakage).
 *
 * `realLocationHash` is a coarse "lat:lng truncated to 2 decimals" grid
 * cell (~1.1km). Nearby captures hash to the same cell and therefore
 * deterministically reuse the same fantasy region — this is what makes
 * "never repeat regions unnecessarily" enforceable without any LLM call on
 * every capture. The unique compound index below is the guardrail.
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { geoPointSchema } from "./geo";

const regionSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    realLocationHash: { type: String, required: true },
    centerPoint: { type: geoPointSchema, required: true },
    fantasyName: { type: String, required: true },
    description: { type: String, default: "" },
    biome: { type: String, required: true },
    firstDiscoveredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

regionSchema.index({ ownerId: 1, realLocationHash: 1 }, { unique: true });
regionSchema.index({ centerPoint: "2dsphere" });

export type RegionDocument = InferSchemaType<typeof regionSchema> & {
  _id: Schema.Types.ObjectId;
};

export const RegionModel: Model<RegionDocument> = model<RegionDocument>(
  "Region",
  regionSchema
);
