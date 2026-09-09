/**
 * apps/api/src/modules/auth/user.model.ts
 *
 * Matches docs/architecture/02-data-schema.md `users` collection exactly.
 * passwordHash is nullable to support Google-OAuth-only accounts; googleId
 * is sparse-indexed for the same reason (most users will have one or the
 * other, some may eventually have both after linking).
 */

import { Schema, model, type InferSchemaType, type Model } from "mongoose";

const userSettingsSchema = new Schema(
  {
    units: { type: String, enum: ["metric", "imperial"], default: "metric" },
    notificationsEnabled: { type: Boolean, default: true },
    weeklyDigestEnabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: null },
    // No `default: null` — a sparse unique index still indexes an explicit
    // null, so two password-only accounts (googleId null) would collide with
    // E11000. Leaving it absent lets `sparse` do its job.
    googleId: { type: String },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    lastLoginAt: { type: Date, default: () => new Date() },
    settings: { type: userSettingsSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const UserModel: Model<UserDocument> = model<UserDocument>("User", userSchema);
