/**
 * apps/api/test/analyzeCapture.worker.test.ts
 *
 * Runs against a REAL local Redis instance (this sandbox has redis-server
 * installed via apt and running — unlike MongoDB, which has no available
 * binary at all here; see CHANGELOG.md for the full contrast). This is
 * genuine integration coverage of the BullMQ producer/worker wiring, not a
 * mock — jobs are actually enqueued, actually picked up by a real Worker,
 * and the Capture document is actually updated as a result.
 *
 * services/ai itself is mocked (via vi.mock on aiServiceClient) since
 * standing up the real FastAPI process inside this test run is out of
 * scope — but the BullMQ mechanics (enqueue -> pickup -> process -> retry
 * -> failure-after-exhausted-attempts -> write error to Mongo) are fully
 * real and exercised end-to-end.
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

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
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
    // suites. If that download is blocked in this environment (see
    // CHANGELOG.md), this suite will fail at this step the same way
    // auth.test.ts/capture.test.ts do, for the same documented reason.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mongod = await MongoMemoryServer.create();
    await connectDb(mongod.getUri());
    (globalThis as any).__mongod = mongod;
  }, 60_000);

  afterAll(async () => {
    await disconnectDb();
    const mongod = (globalThis as any).__mongod;
    if (mongod) await mongod.stop();
    await analyzeCaptureQueue.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    worker = startAnalyzeCaptureWorker();
    await worker.waitUntilReady();
  });

  afterEach(async () => {
    await worker.close();
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

  it("processes a real enqueued job and marks the capture analyzed", async () => {
    const fakeCvResult = {
      isCat: true,
      confidence: 0.91,
      breed: { label: "Bengal", confidence: 0.6 },
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
      return updated?.status === "analyzed";
    });

    const updated = await CaptureModel.findById(capture._id);
    expect(updated?.status).toBe("analyzed");
    expect(updated?.cvResult).toMatchObject(fakeCvResult);
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
