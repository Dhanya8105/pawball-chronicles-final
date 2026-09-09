/**
 * apps/api/src/queues/redisConnection.ts
 *
 * Parses a (non-empty) REDIS_URL into the connection options object BullMQ
 * wants. Callers go through `config/redis.ts`'s `getRedisConnection()`,
 * which returns null when Redis is not configured — this function is only
 * reached with a real URL.
 *
 * Two things beyond a bare host/port split:
 *  - `family: 4` — Node/ioredis resolve a bare "localhost" to IPv6 (::1)
 *    first, and a Docker-published Redis usually listens on IPv4 only; the
 *    blocking BRPOP connection then silently retries forever and the worker
 *    never picks up a job. Forcing IPv4 avoids that.
 *  - `maxRetriesPerRequest: null` — BullMQ requires this on the connection
 *    it uses for blocking commands.
 */

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  family: number;
  maxRetriesPerRequest: null;
}

export function parseRedisConnection(url: string): RedisConnection {
  const parsed = new URL(url);
  const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
  return {
    host,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
    family: 4,
    maxRetriesPerRequest: null,
  };
}
