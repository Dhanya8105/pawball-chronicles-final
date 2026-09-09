/**
 * apps/api/src/modules/auth/tokenHash.ts
 *
 * sha256 is intentional here, not bcrypt: refresh tokens are already
 * high-entropy random JWTs (not low-entropy human passwords), so a fast
 * deterministic hash is correct — we need to look up by exact hash on every
 * refresh/logout call, which bcrypt's salted/slow design doesn't support
 * (each bcrypt hash of the same input differs, so it can't be used as a
 * lookup key). Passwords use bcrypt (auth.service.ts); tokens use sha256.
 */

import { createHash } from "crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
