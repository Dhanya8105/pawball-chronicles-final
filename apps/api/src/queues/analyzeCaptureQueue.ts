/**
 * apps/api/src/queues/analyzeCaptureQueue.ts
 *
 * Single BullMQ queue for the analyze-capture job, matching the flow
 * described in docs/architecture/01-system-architecture.md §2: the upload
 * request returns immediately (capture.controller.ts), and the actual
 * /cv/analyze call happens in a background worker (jobs/analyzeCapture.ts)
 * so a slow or currently-503-because-no-models AI service call never blocks
 * the HTTP response.
 *
 * The connection is created here (not inlined in the worker file) so both
 * the producer (capture.service.ts, enqueuing) and the worker can share
 * one Queue instance / connection config without duplicating Redis
 * connection options.
 */

import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis";

export const ANALYZE_CAPTURE_QUEUE_NAME = "analyze-capture";

export interface AnalyzeCaptureJobData {
  captureId: string;
}

const connection = getRedisConnection();

/** null when REDIS_URL is not configured — callers must guard. */
export const analyzeCaptureQueue: Queue<AnalyzeCaptureJobData> | null = connection
  ? new Queue<AnalyzeCaptureJobData>(ANALYZE_CAPTURE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { age: 24 * 60 * 60 }, // keep completed jobs 24h for debugging
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    })
  : null;
