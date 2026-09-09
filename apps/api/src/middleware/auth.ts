/**
 * apps/api/src/middleware/auth.ts
 *
 * Verifies the Authorization: Bearer <accessToken> header and attaches the
 * decoded payload to req.userId / req.userEmail for downstream handlers.
 * Only checks the JWT signature/expiry — access tokens are intentionally
 * stateless (see modules/auth/jwt.ts), so there's no DB round-trip here,
 * which is the point of using short-lived access tokens in the first place.
 */

import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/jwt";
import { ApiError } from "./errorHandler";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new ApiError(401, "AUTH_UNAUTHORIZED", "Missing or malformed Authorization header."));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    next(new ApiError(401, "AUTH_TOKEN_EXPIRED", "Access token is invalid or expired."));
  }
}
