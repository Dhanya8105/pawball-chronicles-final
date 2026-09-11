/**
 * apps/web/src/lib/config.ts
 *
 * The one shared constant `lib/api.ts` and `lib/store.ts` both need. It
 * lives here (not in api.ts) so store.ts's `refreshTokens()` action can call
 * the API directly without importing api.ts — api.ts already imports
 * `authSession` from store.ts, and that pair importing each other would be
 * a circular dependency.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
