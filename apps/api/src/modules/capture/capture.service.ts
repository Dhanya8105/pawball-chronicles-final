/**
 * apps/api/src/modules/capture/capture.service.ts
 *
 * createCapture has two modes, chosen by whether Redis is configured:
 *
 *   - Queued (REDIS_URL set): persist the capture, enqueue an analyze-capture
 *     BullMQ job, and return immediately in 'pending_analysis'. The worker
 *     (jobs/analyzeCapture.ts) runs the CV call + deterministic pipeline and
 *     the client polls GET /captures/:id to completion.
 *
 *   - Synchronous (no REDIS_URL): there is no worker to run the job, so the
 *     full pipeline — Gemini Vision CV then region/bond/aura/lore — runs
 *     inline in this request. It returns the finished card (status
 *     'complete') or a rejection (status 'failed') in one shot, so the
 *     client needs no polling. This costs the POST 5–10s while Gemini runs.
 */

import type { PawBallDetail } from "@pawball/shared-types";
import { ApiError } from "../../middleware/errorHandler";
import { uploadOriginalCapture } from "../../lib/cloudinary";
import { analyzeCaptureQueue } from "../../queues/analyzeCaptureQueue";
import { getPawballDetail } from "../pawball/pawball.service";
import { analyzeImage } from "./cv.service";
import { runCapturePipeline } from "./capture.pipeline";
import { CaptureModel, type CaptureDocument } from "./capture.model";

export interface CreateCaptureInput {
  ownerId: string;
  imageBuffer: Buffer;
  lat: number;
  lng: number;
  capturedAt?: Date;
}

export interface CreateCaptureResult {
  capture: CaptureDocument;
  /** Set only in synchronous mode once the pipeline reaches 'complete'. */
  pawball?: PawBallDetail;
  bondResult?: {
    pawballId: string;
    isNewPawball: boolean;
    similarityScore?: number | null;
  };
}

export async function createCapture(
  input: CreateCaptureInput
): Promise<CreateCaptureResult> {
  const originalImageUrl = await uploadOriginalCapture(input.imageBuffer, input.ownerId);

  const capture = await CaptureModel.create({
    ownerId: input.ownerId,
    status: "pending_analysis",
    originalImageUrl,
    location: { lat: input.lat, lng: input.lng },
    capturedAt: input.capturedAt ?? new Date(),
  });

  // --- Queued mode: Redis is configured -------------------------------------
  if (analyzeCaptureQueue) {
    try {
      await analyzeCaptureQueue.add(
        "analyze",
        { captureId: capture._id.toString() },
        { jobId: capture._id.toString() }
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[capture] failed to enqueue analysis for ${capture._id.toString()} (Redis down?):`,
        (err as Error).message
      );
    }
    return { capture };
  }

  // --- Synchronous mode: no Redis, no worker — run the pipeline inline ------
  // eslint-disable-next-line no-console
  console.warn(
    `[capture] Redis not configured — running analysis synchronously for capture ${capture._id.toString()}`
  );
  try {
    const cvResult = await analyzeImage(capture.originalImageUrl);
    capture.status = "analyzed";
    capture.cvResult = cvResult;
    await capture.save();

    const outcome = await runCapturePipeline(capture);

    if (outcome.status === "complete" && outcome.pawballId) {
      const pawball = await getPawballDetail(outcome.pawballId, input.ownerId);
      return {
        capture,
        pawball,
        bondResult: {
          pawballId: outcome.pawballId,
          isNewPawball: outcome.isNewPawball ?? true,
        },
      };
    }

    // Rejected (not a cat / low confidence): the pipeline already set
    // capture.status = 'failed' and capture.error. Return it as-is.
    return { capture };
  } catch (err) {
    capture.status = "failed";
    capture.error = {
      stage: "cv_analysis",
      message: (err as Error).message,
    } as CaptureDocument["error"];
    await capture.save();
    return { capture };
  }
}

export async function getCaptureById(
  captureId: string,
  ownerId: string
): Promise<CaptureDocument> {
  const capture = await CaptureModel.findOne({ _id: captureId, ownerId });
  if (!capture) {
    throw new ApiError(404, "CAPTURE_NOT_FOUND", "Capture not found.");
  }
  return capture;
}

export interface CaptureListResult {
  items: CaptureDocument[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCaptures(
  ownerId: string,
  page: number,
  pageSize: number
): Promise<CaptureListResult> {
  const [items, total] = await Promise.all([
    CaptureModel.find({ ownerId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    CaptureModel.countDocuments({ ownerId }),
  ]);

  return { items, total, page, pageSize };
}
