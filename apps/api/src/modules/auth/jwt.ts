/**
 * apps/api/src/modules/auth/jwt.ts
 *
 * Access tokens are short-lived, stateless, verified by middleware on every
 * request (src/middleware/auth.ts) — never stored server-side. Refresh
 * tokens are long-lived and ARE tracked server-side (refreshToken.model.ts)
 * specifically so logout/rotation can revoke them; the JWT signature alone
 * only proves the token is well-formed and unexpired, not that it's still
 * valid, hence the DB check happens in the auth service, not here.
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../../config";

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // unique token id, used to compute tokenHash for DB lookups
}

export function signAccessToken(payload: AccessTokenPayload): string {
  // jsonwebtoken's types want `expiresIn` as a template-literal union
  // (e.g. "15m") rather than plain `string`, but our value comes from an
  // env var at runtime — its exact literal shape can't be known statically.
  // The cast is scoped to this one call site rather than widening the
  // config type, since config.jwtAccessExpiry is correctly typed as
  // `string` everywhere else it's used (e.g. logged, documented).
  const options: SignOptions = { expiresIn: config.jwtAccessExpiry as SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = { expiresIn: config.jwtRefreshExpiry as SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwtRefreshSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwtSecret) as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as unknown as RefreshTokenPayload;
}
