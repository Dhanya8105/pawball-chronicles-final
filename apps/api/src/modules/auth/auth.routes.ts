/**
 * apps/api/src/modules/auth/auth.routes.ts
 *
 * Login/register get a stricter rate limit than the rest of the API —
 * these are the classic brute-force/credential-stuffing targets. Other
 * auth routes use the default API-wide limiter mounted in app.ts.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";

import { config } from "../../config";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import {
  getMeHandler,
  googleAuthHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
} from "./auth.controller";
import {
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "./auth.validators";

export const authRouter = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // The process-wide in-memory counter would otherwise leak across the test
  // suite (dozens of register/login calls) and 429 later tests.
  skip: () => config.isTest,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Please try again later.",
      retryAfterSeconds: 15 * 60,
    },
  },
});

authRouter.post(
  "/register",
  credentialLimiter,
  validateBody(registerSchema),
  asyncHandler(registerHandler)
);

authRouter.post(
  "/login",
  credentialLimiter,
  validateBody(loginSchema),
  asyncHandler(loginHandler)
);

authRouter.post(
  "/google",
  credentialLimiter,
  validateBody(googleAuthSchema),
  asyncHandler(googleAuthHandler)
);

authRouter.post("/refresh", validateBody(refreshSchema), asyncHandler(refreshHandler));

authRouter.post("/logout", validateBody(logoutSchema), asyncHandler(logoutHandler));

authRouter.get("/me", requireAuth, asyncHandler(getMeHandler));
