/**
 * apps/api/src/modules/auth/auth.validators.ts
 *
 * Request body validation, kept separate from controllers so the
 * validation rules are independently testable and reusable if a second
 * entrypoint (e.g. a future mobile-specific route) needs the same shape.
 */

import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(60),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
