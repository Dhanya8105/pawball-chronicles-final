/**
 * apps/api/src/queues/redisConnection.ts
 *
 * One parser for REDIS_URL -> the { host, port, password } object BullMQ's
 * `connection` option wants. Previously duplicated in analyzeCaptureQueue.ts
 * and jobs/analyzeCapture.ts.
 */

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
}

export function parseRedisConnection(url: string | undefined): RedisConnection {
  const parsed = new URL(url ?? "redis://localhost:6379");
  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : 6379,
    password: parsed.password || undefined,
  };
}
