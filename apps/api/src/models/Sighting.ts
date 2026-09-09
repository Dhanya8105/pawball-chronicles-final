/**
 * apps/api/src/models/Sighting.ts
 *
 * Matches docs/architecture/02-data-schema.md `sightings` collection — one
 * append-only document per individual capture event. Kept separate from
 * `pawballs` (current aggregate state) so collection-view queries stay fast
 * no matter how many times a cat has been seen, and so the Bond System and
 * Weekly Life Engine have a real event log to read.
 *
 * `pawballId` is nullable: a sighting row is written by the capture
 * pipeline only after bond resolution has decided which PawBall it belongs
 * to, but the field is left nullable to match the schema doc and to allow a
 * future async bond step.
 *
 * `cvSnapshot` is a frozen copy of the CV output at capture time —
 * `pawballs.visualProfile` can drift/improve over later sightings, this is
 * the historical record. Stored as Mixed for the same reason
 * captures.cvResult is (the shape still tracks services/ai).
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";
import { geoPointSchema } from "./geo";

const weatherSnapshotSchema = new Schema(
  { condition: { type: String, required: true }, tempC: { type: Number, required: true } },
  { _id: false }
);

const sightingSchema = new Schema(
  {
    pawballId: { type: Schema.Types.ObjectId, ref: "PawBall", default: null, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    captureId: { type: Schema.Types.ObjectId, ref: "Capture", required: true, unique: true },
    location: { type: geoPointSchema, required: true },
    regionId: { type: Schema.Types.ObjectId, ref: "Region", required: true },
    capturedAt: { type: Date, required: true },
    weatherSnapshot: { type: weatherSnapshotSchema, default: null },
    cvSnapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

sightingSchema.index({ location: "2dsphere" });
sightingSchema.index({ pawballId: 1, capturedAt: -1 });
sightingSchema.index({ ownerId: 1, capturedAt: -1 });

export type SightingDocument = InferSchemaType<typeof sightingSchema> & {
  _id: Schema.Types.ObjectId;
};

export const SightingModel: Model<SightingDocument> = model<SightingDocument>(
  "Sighting",
  sightingSchema
);
