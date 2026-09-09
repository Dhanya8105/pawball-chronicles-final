/**
 * apps/api/src/index.ts
 *
 * Process entrypoint. Connects to MongoDB before binding the port, so the
 * server never starts accepting requests against a database it can't
 * reach — a request that touches Mongo while disconnected would otherwise
 * hang or fail in a confusing way instead of the process failing fast at
 * boot with a clear error.
 *
 * Milestone 3: also starts the analyze-capture BullMQ worker in the same
 * process as the HTTP server. This is a deliberate simplification for now
 * — a production deployment would typically run the worker as a separate
 * process/container so a CPU-heavy or stuck job can't starve the HTTP
 * event loop, but combining them keeps `npm run dev` / `docker compose up`
 * a single command for this milestone. Splitting them into
 * `src/worker.ts` + a separate Dockerfile CMD is a clean, localized change
 * whenever that becomes worth doing (flagged as a Milestone 10 production-
 * readiness item).
 */

import { createApp } from "./app";
import { config } from "./config";
import { isRedisEnabled } from "./config/redis";
import { connectDb } from "./db/mongoose";
import { startAnalyzeCaptureWorker } from "./jobs/analyzeCapture";
import { startWeeklyLifeWorker } from "./jobs/weeklyLifeTick";
import { registerWeeklyLifeSchedule } from "./queues/weeklyLifeQueue";

async function startBackgroundWorkers(): Promise<void> {
  const analyzeWorker = startAnalyzeCaptureWorker();
  analyzeWorker?.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[analyze-capture-worker] error:", err);
  });

  const weeklyLifeWorker = startWeeklyLifeWorker();
  weeklyLifeWorker?.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[weekly-life-worker] error:", err);
  });

  // Registering the repeatable schedule is a Redis write — a transiently
  // unreachable Redis must not block HTTP startup.
  try {
    await registerWeeklyLifeSchedule();
    // eslint-disable-next-line no-console
    console.log(
      "[pawball-api] background workers started + weekly-life schedule registered"
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[pawball-api] weekly-life schedule not registered (Redis unreachable?):",
      (err as Error).message
    );
  }
}

async function main(): Promise<void> {
  await connectDb();
  // eslint-disable-next-line no-console
  console.log("[pawball-api] connected to MongoDB");

  if (isRedisEnabled()) {
    await startBackgroundWorkers();
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      "[pawball-api] REDIS_URL not set — background workers disabled. HTTP " +
        "routes and capture upload still work; captures stay 'pending_analysis' " +
        "and weekly-life runs only via runWeeklyLifeTick()."
    );
  }

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[pawball-api] listening on port ${config.port} (${config.nodeEnv})`
    );
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[pawball-api] failed to start:", err);
  process.exit(1);
});
