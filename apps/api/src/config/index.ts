/**
 * apps/api/src/config/index.ts
 *
 * Single source of truth for environment configuration. Everything that
 * reads process.env does so through this module — nothing else in the
 * codebase should call process.env directly, so config drift/typos surface
 * here instead of scattered across modules.
 *
 * Milestone 2: auth (JWT secrets) and persistence (Mongo URI) are now
 * actually consumed by running code, so they're validated as required —
 * except in NODE_ENV=test, where tests supply their own throwaway secrets
 * via vitest setup rather than requiring real ones in CI for a fast unit
 * test run. Cloudinary stays optional here: capture upload will fail
 * clearly at the point of use if unset (see modules/capture), rather than
 * crashing the whole server on boot for a feature not every dev environment
 * needs to exercise immediately.
 */

import "dotenv/config";

function readEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] ?? fallback;
}

function requireEnv(key: string, fallback?: string): string {
  const value = readEnv(key, fallback);
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const nodeEnv = readEnv("NODE_ENV", "development") as
  | "development"
  | "production"
  | "test";

const isTest = nodeEnv === "test";

export const config = {
  nodeEnv,
  port: parseInt(requireEnv("PORT", "4000"), 10),
  corsOrigin: requireEnv("CORS_ORIGIN", "http://localhost:3000"),

  mongoUri: requireEnv(
    "MONGO_URI",
    isTest ? "mongodb://127.0.0.1:27017/pawball-test" : undefined
  ),
  redisUrl: readEnv("REDIS_URL", "redis://localhost:6379"),

  jwtSecret: requireEnv("JWT_SECRET", isTest ? "test-jwt-secret" : undefined),
  jwtRefreshSecret: requireEnv(
    "JWT_REFRESH_SECRET",
    isTest ? "test-jwt-refresh-secret" : undefined
  ),
  jwtAccessExpiry: readEnv("JWT_ACCESS_EXPIRY", "15m"),
  jwtRefreshExpiry: readEnv("JWT_REFRESH_EXPIRY", "30d"),
  // Refresh token lifetime in days, mirrors JWT_REFRESH_EXPIRY for the
  // refresh_tokens collection's TTL index (which needs a plain number of
  // seconds, not a jsonwebtoken-style duration string).
  jwtRefreshExpiryDays: parseInt(readEnv("JWT_REFRESH_EXPIRY_DAYS", "30")!, 10),

  googleClientId: readEnv("GOOGLE_CLIENT_ID"),
  googleClientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
  aiServiceUrl: readEnv("AI_SERVICE_URL", "http://localhost:8000"),
  cloudinary: {
    cloudName: readEnv("CLOUDINARY_CLOUD_NAME"),
    apiKey: readEnv("CLOUDINARY_API_KEY"),
    apiSecret: readEnv("CLOUDINARY_API_SECRET"),
  },

  isProduction: nodeEnv === "production",
  isTest,
};

export type AppConfig = typeof config;

