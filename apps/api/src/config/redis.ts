/**
 * apps/api/src/config/redis.ts
 *
 * Redis is optional. When `REDIS_URL` is empty or unset this returns null
 * and the API runs fully without a queue backend:
 *
 *   - every HTTP route works normally;
 *   - the BullMQ workers (capture analysis, weekly life) don't start;
 *   - `createCapture` still persists the capture, it just isn't queued for
 *     CV analysis (stays `pending_analysis`);
 *   - the Weekly Life tick isn't auto-scheduled — call `runWeeklyLifeTick()`
 *     manually (it does not need Redis).
 *
 * The rate-limiter middleware is unaffected either way: it uses
 * express-rate-limit's in-memory store and never involved Redis.
 */

import { config } from "./index";
import {
  parseRedisConnection,
  type RedisConnection,
} from "../queues/redisConnection";

function redisUrl(): string | null {
  const url = config.redisUrl;
  return typeof url === "string" && url.trim().length > 0 ? url : null;
}

/** True when a non-empty REDIS_URL is configured. */
export function isRedisEnabled(): boolean {
  return redisUrl() !== null;
}

/** BullMQ `connection` options, or null when Redis is not configured. */
export function getRedisConnection(): RedisConnection | null {
  const url = redisUrl();
  return url === null ? null : parseRedisConnection(url);
}
