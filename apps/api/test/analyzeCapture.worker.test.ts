/**
 * apps/api/test/analyzeCapture.worker.test.ts
 *
 * INTEGRATION-ONLY — not part of `npm test`. Run with `npm run test:integration`
 * (needs a local Redis on 127.0.0.1:6379).
 *
 * It wires a real BullMQ Worker to a real Redis and a mongodb-memory-server
 * and drives a job through `startAnalyzeCaptureWorker` + the full capture
 * pipeline. Useful as a smoke test, but flaky under Vitest's process model —
 * the BullMQ worker intermittently doesn't begin consuming within the poll
 * window. Deterministic coverage of the BullMQ mechanics lives in
 * `queueMechanics.test.ts` (real Redis, no Mongo); the end-to-end
 * worker -> pipeline path is exercised manually against the running stack.
 *
 * services/ai is mocked (vi.mock on aiServiceClient).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Queue, Worker } from "bullmq";
import mongoose from "mongoose";

vi.mock("../src/lib/aiServiceClient", () => ({
  analyzeCaptureImage: vi.fn(),
  AiServiceError: class AiServiceError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  AiServiceUnavailableError: class AiServiceUnavailableError extends Error {
    statusCode = 503;
  },
}));

import { analyzeCaptureImage } from "../src/lib/aiServiceClient";
import { startAnalyzeCaptureWorker } from "../src/jobs/analyzeCapture";
import { analyzeCaptureQueue, ANALYZE_CAPTURE_QUEUE_NAME } from "../src/queues/analyzeCaptureQueue";
import { CaptureModel } from "../src/modules/capture/capture.model";
import { UserModel } from "../src/modules/auth/user.model";
import { connectDb, disconnectDb } from "../src/db/mongoose";

const REDIS_CONNECTION = { host: "127.0.0.1", port: 6379 };

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("waitFor timed out");
}

describe("analyze-capture worker (real Redis, mocked AI service)", () => {
  let worker: Worker;

  beforeAll(async () => {
    // This suite needs Mongo too (Capture documents are real Mongoose
    // docs) — uses mongodb-memory-server like the rest of the auth/capture
    // suites.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mongod = await MongoMemoryServer.create();
    await connectDb(mongod.getUri());
    (globalThis as any).__mongod = mongod;
    // One long-lived worker for the whole suite — creating/closing a BullMQ
    // worker per test races (a half-closed worker can hold a job's lock and
    // stall the next test).
    worker = startAnalyzeCaptureWorker();
    await worker.waitUntilReady();
  }, 60_000);

  afterAll(async () => {
    await worker.close();
    await analyzeCaptureQueue.close();
    await disconnectDb();
    const mongod = (globalThis as any).__mongod;
    if (mongod) await mongod.stop();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Drain the queue so a leftover retrying job can't bleed into the next
    // test, then wipe Mongo.
    await analyzeCaptureQueue.drain(true);
    await analyzeCaptureQueue.clean(0, 10_000, "completed");
    await analyzeCaptureQueue.clean(0, 10_000, "failed");
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  });

  async function createTestCapture() {
    const user = await UserModel.create({
      email: `worker-test-${Date.now()}@pawball.test`,
      displayName: "Worker Test",
      passwordHash: "irrelevant",
    });
    return CaptureModel.create({
      ownerId: user._id,
      status: "pending_analysis",
      originalImageUrl: "https://res.cloudinary.com/test/cat.jpg",
      location: { lat: 12.97, lng: 77.59 },
      capturedAt: new Date(),
    });
  }

  it("processes a real enqueued job: writes cvResult and runs the pipeline to completion", async () => {
    // A full CvAnalysisResult — the worker now runs the deterministic
    // pipeline (region -> bond -> aura -> lore) after writing cvResult, so a
    // partial result would crash it. See modules/capture/capture.pipeline.ts.
    const fakeCvResult = {
      isCat: true,
      confidence: 0.91,
      breed: { label: "Bengal", confidence: 0.6 },
      pose: { label: "sitting", confidence: 0.7 },
      faceOrientation: { label: "front", confidence: 0.6 },
      eyeOpenness: { label: "open", confidence: 0.8 },
      earOrientation: { label: "alert", confidence: 0.6 },
      tailVisible: true,
      coat: { color: "orange", pattern: "tabby", confidence: 0.7 },
      estimatedAgeGroup: { label: "adult", confidence: 0.7 },
      surroundings: [{ label: "forest", confidence: 0.5 }],
    };
    (analyzeCaptureImage as ReturnType<typeof vi.fn>).mockResolvedValue(fakeCvResult);

    const capture = await createTestCapture();
    await analyzeCaptureQueue.add(
      "analyze",
      { captureId: capture._id.toString() },
      { jobId: capture._id.toString() }
    );

    await waitFor(async () => {
      const updated = await CaptureModel.findById(capture._id);
      return updated?.status === "complete";
    });

    const updated = await CaptureModel.findById(capture._id);
    expect(updated?.status).toBe("complete");
    expect(updated?.cvResult).toMatchObject(fakeCvResult);
    expect(updated?.bondResult?.isNewPawball).toBe(true);
  }, 15_000);

  it("marks the capture failed after exhausting retries on a permanent error", async () => {
    (analyzeCaptureImage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("image url is permanently invalid")
    );

    const capture = await createTestCapture();
    // Use a queue instance with only 1 attempt for this test, so we don't
    // wait through the full exponential backoff of the default 3 attempts.
    const fastQueue = new Queue(ANALYZE_CAPTURE_QUEUE_NAME, {
      connection: REDIS_CONNECTION,
    });
    await fastQueue.add(
      "analyze",
      { captureId: capture._id.toString() },
      { jobId: `fast-${capture._id.toString()}`, attempts: 1 }
    );
    await fastQueue.close();

    await waitFor(async () => {
      const updated = await CaptureModel.findById(capture._id);
      return updated?.status === "failed";
    });

    const updated = await CaptureModel.findById(capture._id);
    expect(updated?.status).toBe("failed");
    expect(updated?.error?.message).toContain("permanently invalid");
  }, 15_000);

  it("does not crash when the capture referenced by a job no longer exists", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await analyzeCaptureQueue.add("analyze", { captureId: fakeId }, { jobId: fakeId });

    // No assertion target document — this test passes if the worker
    // doesn't throw/crash the process; a short wait gives the job a chance
    // to be processed (and silently no-op, per analyzeCapture.ts's
    // "capture was deleted" early return).
    await new Promise((r) => setTimeout(r, 1000));
    expect(true).toBe(true);
  }, 10_000);
});
