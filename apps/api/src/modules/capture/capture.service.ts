/**
 * apps/api/src/modules/capture/capture.service.ts
 *
 * Milestone 3 update: createCapture now enqueues an analyze-capture BullMQ
 * job after persisting the capture, so the upload request still returns
 * immediately (per docs/architecture/01-system-architecture.md §2) while
 * the actual /cv/analyze call happens in the background worker
 * (jobs/analyzeCapture.ts). The capture stays in 'pending_analysis' until
 * that worker picks up the job and either moves it to 'analyzed' or
 * 'failed'.
 */

import { ApiError } from "../../middleware/errorHandler";
import { uploadOriginalCapture } from "../../lib/cloudinary";
import { analyzeCaptureQueue } from "../../queues/analyzeCaptureQueue";
import { CaptureModel, type CaptureDocument } from "./capture.model";

export interface CreateCaptureInput {
  ownerId: string;
  imageBuffer: Buffer;
  lat: number;
  lng: number;
  capturedAt?: Date;
}

export async function createCapture(
  input: CreateCaptureInput
): Promise<CaptureDocument> {
  const originalImageUrl = await uploadOriginalCapture(input.imageBuffer, input.ownerId);

  const capture = await CaptureModel.create({
    ownerId: input.ownerId,
    status: "pending_analysis",
    originalImageUrl,
    location: { lat: input.lat, lng: input.lng },
    capturedAt: input.capturedAt ?? new Date(),
  });

  // Fire-and-forget from this function's perspective: enqueueing is fast
  // (a Redis write), and a failure to enqueue shouldn't fail the upload
  // request itself — but it IS awaited so a genuine Redis-unreachable
  // error surfaces as a clear 5xx to the client now, rather than silently
  // leaving a capture stuck in pending_analysis forever with no job ever
  // queued and no error shown anywhere.
  await analyzeCaptureQueue.add(
    "analyze",
    { captureId: capture._id.toString() },
    { jobId: capture._id.toString() }
  );

  return capture;
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
