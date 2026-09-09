/**
 * apps/api/test/queueMechanics.test.ts
 *
 * Unlike analyzeCapture.worker.test.ts (which needs MongoDB for real
 * Capture documents and therefore inherits the mongodb-memory-server
 * download limitation documented in CHANGELOG.md), this file tests ONLY
 * the BullMQ producer/consumer mechanics against the real local Redis
 * instance — no Mongo dependency at all. This is what's actually runnable
 * end-to-end in this development sandbox and was run for real, not just
 * written.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Queue, Worker, type Job } from "bullmq";

const REDIS_CONNECTION = { host: "127.0.0.1", port: 6379 };
const TEST_QUEUE_NAME = "test-queue-mechanics";

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor timed out");
}

describe("BullMQ producer/consumer mechanics (real Redis)", () => {
  let queue: Queue;
  let worker: Worker | null = null;

  beforeEach(() => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: REDIS_CONNECTION });
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
      worker = null;
    }
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  afterAll(async () => {
    // give Redis a moment to settle after the last obliterate
    await new Promise((r) => setTimeout(r, 100));
  });

  it("a real enqueued job is actually picked up and processed by a real worker", async () => {
    const processed: unknown[] = [];

    worker = new Worker(
      TEST_QUEUE_NAME,
      async (job: Job) => {
        processed.push(job.data);
      },
      { connection: REDIS_CONNECTION }
    );
    await worker.waitUntilReady();

    await queue.add("test-job", { hello: "world" });

    await waitFor(() => processed.length === 1);
    expect(processed[0]).toEqual({ hello: "world" });
  }, 10_000);

  it("a job that throws is retried according to the configured attempts", async () => {
    let attemptCount = 0;

    worker = new Worker(
      TEST_QUEUE_NAME,
      async () => {
        attemptCount += 1;
        throw new Error("simulated transient failure");
      },
      { connection: REDIS_CONNECTION }
    );
    await worker.waitUntilReady();

    await queue.add(
      "retry-job",
      {},
      { attempts: 3, backoff: { type: "fixed", delay: 100 } }
    );

    await waitFor(() => attemptCount === 3, 8000);
    expect(attemptCount).toBe(3);
  }, 12_000);

  it("jobs are processed in roughly FIFO order for a single worker", async () => {
    const order: number[] = [];

    worker = new Worker(
      TEST_QUEUE_NAME,
      async (job: Job) => {
        order.push(job.data.n);
      },
      { connection: REDIS_CONNECTION, concurrency: 1 }
    );
    await worker.waitUntilReady();

    for (let i = 0; i < 5; i++) {
      await queue.add("ordered-job", { n: i });
    }

    await waitFor(() => order.length === 5);
    expect(order).toEqual([0, 1, 2, 3, 4]);
  }, 10_000);

  it("a failed job emits the worker's failed event with the real error", async () => {
    const failedHandler = vi.fn();

    worker = new Worker(
      TEST_QUEUE_NAME,
      async () => {
        throw new Error("deliberate failure for event test");
      },
      { connection: REDIS_CONNECTION }
    );
    worker.on("failed", failedHandler);
    await worker.waitUntilReady();

    await queue.add("failing-job", {}, { attempts: 1 });

    await waitFor(() => failedHandler.mock.calls.length === 1);
    const [, error] = failedHandler.mock.calls[0];
    expect(error.message).toBe("deliberate failure for event test");
  }, 10_000);
});
