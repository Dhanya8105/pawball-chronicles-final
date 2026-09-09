/**
 * apps/api/src/modules/auth/refreshToken.model.ts
 *
 * Matches docs/architecture/02-data-schema.md `refresh_tokens` collection.
 * Stores only a sha256 hash of the actual token (never the raw token
 * itself, same principle as password hashing). The TTL index means Mongo
 * itself reaps expired rows — no separate cleanup job needed.
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDocument = InferSchemaType<typeof refreshTokenSchema> & {
  _id: Schema.Types.ObjectId;
};
export const RefreshTokenModel: Model<RefreshTokenDocument> = model<RefreshTokenDocument>(
  "RefreshToken",
  refreshTokenSchema
);
