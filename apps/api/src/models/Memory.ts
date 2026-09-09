/**
 * apps/api/src/models/Memory.ts
 *
 * Matches docs/architecture/02-data-schema.md `memories` collection —
 * weekly-life-engine and bond-unlocked narrative entries. Append-only.
 *
 * `weekKey` (e.g. "2026-W37") is an addition beyond the schema doc: it
 * exists purely so `jobs/weeklyLifeTick.ts` is idempotent. The weekly job
 * iterates every PawBall and would otherwise create a duplicate
 * `weekly_life` memory every time it runs (or re-runs after a failure).
 * The partial unique index on `{ pawballId, weekKey }` makes a second
 * insert for the same PawBall+week a no-op. It is null for every non-weekly
 * memory type, and the partial filter keeps those rows out of the unique
 * constraint.
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const MEMORY_TYPES = [
  "weekly_life",
  "bond_unlock",
  "title_earned",
  "seasonal_event",
] as const;

const memorySchema = new Schema(
  {
    pawballId: { type: Schema.Types.ObjectId, ref: "PawBall", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: MEMORY_TYPES, required: true },
    text: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    weekKey: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

memorySchema.index({ pawballId: 1, occurredAt: -1 });
memorySchema.index({ ownerId: 1, occurredAt: -1 });
memorySchema.index(
  { pawballId: 1, weekKey: 1 },
  { unique: true, partialFilterExpression: { weekKey: { $type: "string" } } }
);

export type MemoryDocument = InferSchemaType<typeof memorySchema> & {
  _id: Schema.Types.ObjectId;
};

export const MemoryModel: Model<MemoryDocument> = model<MemoryDocument>(
  "Memory",
  memorySchema
);
