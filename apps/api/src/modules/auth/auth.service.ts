/**
 * apps/api/src/modules/auth/auth.service.ts
 *
 * All auth business logic lives here, independent of Express req/res, so
 * it's directly unit-testable and so the controller stays a thin
 * HTTP-shape-translation layer. Per the module-boundary rule in
 * docs/architecture/01-system-architecture.md, other modules that need
 * "who is this user" should eventually import a narrow interface from here
 * rather than querying UserModel directly.
 */

import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";

import { config } from "../../config";
import { ApiError } from "../../middleware/errorHandler";
import { RefreshTokenModel } from "./refreshToken.model";
import { UserModel, type UserDocument } from "./user.model";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./jwt";
import { hashToken } from "./tokenHash";

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
  };
}

async function issueTokenPair(user: UserDocument): Promise<TokenPair> {
  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
  });

  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), jti });

  const expiresAt = new Date(
    Date.now() + config.jwtRefreshExpiryDays * 24 * 60 * 60 * 1000
  );

  await RefreshTokenModel.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const existing = await UserModel.findOne({ email: input.email });
  if (existing) {
    throw new ApiError(409, "AUTH_EMAIL_TAKEN", "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await UserModel.create({
    email: input.email,
    passwordHash,
    displayName: input.displayName,
  });

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), tokens };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<{ user: PublicUser; tokens: TokenPair }> {
  const user = await UserModel.findOne({ email: input.email });
  if (!user || !user.passwordHash) {
    // Same error for "no such user" and "wrong password" — never reveal
    // which one it was, that's an enumeration vector.
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const isValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValid) {
    throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), tokens };
}

const googleClient = new OAuth2Client(config.googleClientId);

export async function loginWithGoogle(
  idToken: string
): Promise<{ user: PublicUser; tokens: TokenPair }> {
  if (!config.googleClientId) {
    throw new ApiError(
      503,
      "AUTH_GOOGLE_TOKEN_INVALID",
      "Google sign-in is not configured on this server."
    );
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, "AUTH_GOOGLE_TOKEN_INVALID", "Invalid Google ID token.");
  }

  if (!payload?.email || !payload.sub) {
    throw new ApiError(401, "AUTH_GOOGLE_TOKEN_INVALID", "Invalid Google ID token.");
  }

  let user = await UserModel.findOne({
    $or: [{ googleId: payload.sub }, { email: payload.email }],
  });

  if (!user) {
    user = await UserModel.create({
      email: payload.email,
      googleId: payload.sub,
      displayName: payload.name ?? payload.email.split("@")[0],
      avatarUrl: payload.picture ?? null,
    });
  } else if (!user.googleId) {
    // Existing password-based account signing in with Google for the first
    // time — link the accounts rather than creating a duplicate.
    user.googleId = payload.sub;
    await user.save();
  }

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user);
  return { user: toPublicUser(user), tokens };
}

export async function refresh(refreshTokenInput: string): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenInput);
  } catch {
    throw new ApiError(401, "AUTH_TOKEN_INVALID", "Invalid or expired refresh token.");
  }

  const tokenHash = hashToken(refreshTokenInput);
  const stored = await RefreshTokenModel.findOne({ tokenHash });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new ApiError(401, "AUTH_TOKEN_INVALID", "Invalid or expired refresh token.");
  }

  const user = await UserModel.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, "AUTH_TOKEN_INVALID", "Invalid or expired refresh token.");
  }

  // Rotation: the old token dies the instant a new one is issued, so a
  // stolen-and-replayed old refresh token can't be used after the
  // legitimate client has already rotated past it.
  stored.revokedAt = new Date();
  await stored.save();

  return issueTokenPair(user);
}

export async function logout(refreshTokenInput: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenInput);
  await RefreshTokenModel.updateOne(
    { tokenHash, revokedAt: null },
    { revokedAt: new Date() }
  );
  // Intentionally no error if the token was already revoked/unknown —
  // logout is idempotent from the client's perspective.
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new ApiError(401, "AUTH_UNAUTHORIZED", "User no longer exists.");
  }
  return toPublicUser(user);
}
