/**
 * apps/api/src/jobs/analyzeCapture.ts
 *
 * The actual analyze step of the pipeline described in
 * docs/architecture/01-system-architecture.md §2: pulls a capture's image
 * URL, calls services/ai's /cv/analyze, and writes the result back onto
 * the Capture document. Does NOT yet enqueue the generate-artwork step
 * (Milestone 6) — a capture transitions pending_analysis -> analyzed ->
 * failed in this milestone; 'generating_art' and 'complete' remain
 * reachable only once Milestone 6 wires the next stage, exactly like
 * Milestone 2 left the whole pipeline at 'pending_analysis'.
 *
 * Retry behavior: AiServiceUnavailableError (no models loaded — the
 * expected state until scripts/download_models.sh has been run) is
 * re-thrown so BullMQ's configured retry/backoff (queues/
 * analyzeCaptureQueue.ts) keeps trying rather than marking the capture
 * permanently failed on the first attempt. Any other error (bad image URL,
 * a genuine bug) also retries up to the configured attempt limit, then the
 * job's final failure is caught by the worker's 'failed' handler below and
 * written to Capture.error so it's visible via GET /captures/:id rather
 * than silently disappearing into BullMQ's internal state.
 */

import { Worker, type Job } from "bullmq";
import { analyzeCaptureImage, AiServiceError } from "../lib/aiServiceClient";
import { CaptureModel } from "../modules/capture/capture.model";
import { runCapturePipeline } from "../modules/capture/capture.pipeline";
import { getRedisConnection } from "../config/redis";
import {
  ANALYZE_CAPTURE_QUEUE_NAME,
  type AnalyzeCaptureJobData,
} from "../queues/analyzeCaptureQueue";

async function processAnalyzeCaptureJob(job: Job<AnalyzeCaptureJobData>): Promise<void> {
  const capture = await CaptureModel.findById(job.data.captureId);
  if (!capture) {
    // Capture was deleted or the ID was wrong — not retryable, and not a
    // failure that should keep BullMQ retrying forever.
    return;
  }

  // Skip the (paid, slow) CV call on a retry where analysis already
  // succeeded but a later pipeline step threw — re-run only the
  // deterministic tail below.
  if (!capture.cvResult) {
    const cvResult = await analyzeCaptureImage(capture.originalImageUrl);
    capture.status = "analyzed";
    capture.cvResult = cvResult;
    await capture.save();
  }

  // Region -> Bond -> Aura -> Lore -> PawBall/Sighting/Memory, then mark the
  // capture complete. Idempotent (see modules/capture/capture.pipeline.ts).
  await runCapturePipeline(capture);
}

/** Returns null when REDIS_URL is not configured (no worker to run). */
export function startAnalyzeCaptureWorker(): Worker<AnalyzeCaptureJobData> | null {
  const connection = getRedisConnection();
  if (!connection) return null;

  const worker = new Worker<AnalyzeCaptureJobData>(
    ANALYZE_CAPTURE_QUEUE_NAME,
    processAnalyzeCaptureJob,
    { connection }
  );

  worker.on("failed", async (job, error) => {
    if (!job) return;
    // Only write the permanent-failure state once BullMQ has exhausted all
    // configured retry attempts — an intermediate retry failure shouldn't
    // mark the capture as failed while a later attempt might still succeed.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    const stage = error instanceof AiServiceError ? "cv_analysis" : "cv_analysis_unknown";
    await CaptureModel.findByIdAndUpdate(job.data.captureId, {
      status: "failed",
      error: { stage, message: error.message },
    });
  });

  return worker;
}
