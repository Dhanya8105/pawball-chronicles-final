/**
 * apps/api/src/queues/weeklyLifeQueue.ts
 *
 * The Weekly Life Engine runs as a BullMQ *repeatable* job (not an HTTP
 * action) — docs/architecture/04-api-contracts.md §Weekly Life. This file
 * owns the queue + the connection config; jobs/weeklyLifeTick.ts owns the
 * worker and the actual per-PawBall generation.
 *
 * `registerWeeklyLifeSchedule()` is called once at startup (src/index.ts).
 * Re-registering the same repeat pattern is a no-op in BullMQ, so it is
 * safe to call on every boot.
 */

import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis";

export const WEEKLY_LIFE_QUEUE_NAME = "weekly-life";
export const WEEKLY_LIFE_JOB_NAME = "weekly-life-tick";

/** Mondays at 06:00 (server local time). */
export const WEEKLY_LIFE_CRON = "0 6 * * 1";

export interface WeeklyLifeJobData {
  /** ISO timestamp the tick represents; defaults to "now" at run time. */
  asOf?: string;
}

const connection = getRedisConnection();

/** null when REDIS_URL is not configured. `runWeeklyLifeTick()` in
 * jobs/weeklyLifeTick.ts works without it — only the auto-schedule needs a
 * queue. */
export const weeklyLifeQueue: Queue<WeeklyLifeJobData> | null = connection
  ? new Queue<WeeklyLifeJobData>(WEEKLY_LIFE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 30 * 24 * 60 * 60 },
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      },
    })
  : null;

export async function registerWeeklyLifeSchedule(): Promise<void> {
  if (!weeklyLifeQueue) {
    // eslint-disable-next-line no-console
    console.warn(
      "[weekly-life] Redis not configured — schedule not registered; run runWeeklyLifeTick() manually"
    );
    return;
  }
  await weeklyLifeQueue.add(
    WEEKLY_LIFE_JOB_NAME,
    {},
    {
      repeat: { pattern: WEEKLY_LIFE_CRON },
      jobId: "weekly-life-repeatable",
    }
  );
}
