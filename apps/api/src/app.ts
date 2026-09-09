/**
 * apps/api/src/app.ts
 *
 * Express app factory, separated from src/index.ts (the listener) so tests
 * can import the app and exercise it with supertest without binding a real
 * port.
 */

import cors from "cors";
import express, { type Express } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";

import { config } from "./config";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { captureRouter } from "./modules/capture/capture.routes";
import { collectionRouter } from "./modules/collection/collection.router";
import { healthRouter } from "./modules/health/routes";
import { mapRouter } from "./modules/map/map.router";
import { pawballRouter } from "./modules/pawball/pawball.router";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  if (config.nodeEnv !== "test") {
    app.use(morgan(config.isProduction ? "combined" : "dev"));
  }

  // Mounted at root (not /api/v1) — health checks are typically probed by
  // infra (load balancers, Docker healthcheck) without the API version
  // prefix. Versioned business routes mount under /api/v1.
  app.use("/", healthRouter);

  // API-wide rate limit, separate from auth's stricter credentialLimiter
  // (see modules/auth/auth.routes.ts) — this one's a general abuse
  // backstop, not a brute-force-specific control.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.isProduction ? 120 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: "RATE_LIMITED", message: "Too many requests.", retryAfterSeconds: 60 },
    },
  });

  app.use("/api/v1", apiLimiter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/captures", captureRouter);
  app.use("/api/v1/pawballs", pawballRouter);
  app.use("/api/v1/collection", collectionRouter);
  app.use("/api/v1/map", mapRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
