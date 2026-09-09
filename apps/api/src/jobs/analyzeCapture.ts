/**
 * apps/api/src/jobs/analyzeCapture.ts
 *
 * The analyze step of the capture pipeline: runs the (in-process) Gemini
 * Vision CV on the capture's photo (modules/capture/cv.service.ts), writes
 * the result onto the Capture, then runs the deterministic pipeline
 * (region -> bond -> aura -> lore -> PawBall/Sighting/Memory).
 *
 * Retry behaviour: the CV call retries transient failures (429/5xx/timeout)
 * internally. Any error that still propagates retries up to BullMQ's
 * configured attempt limit; the final failure is caught by the worker's
 * 'failed' handler below and written to Capture.error so it's visible via
 * GET /captures/:id.
 */

import { Worker, type Job } from "bullmq";
import { analyzeImage, CvAnalysisError } from "../modules/capture/cv.service";
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
    const cvResult = await analyzeImage(capture.originalImageUrl);
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

    const stage =
      error instanceof CvAnalysisError ? "cv_analysis" : "cv_analysis_unknown";
    await CaptureModel.findByIdAndUpdate(job.data.captureId, {
      status: "failed",
      error: { stage, message: error.message },
    });
  });

  return worker;
}
