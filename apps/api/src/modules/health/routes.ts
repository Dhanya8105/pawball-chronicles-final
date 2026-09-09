/**
 * apps/api/src/modules/health/routes.ts
 *
 * Liveness/readiness endpoint. Reports MongoDB connection status now that
 * Milestone 2 wires a real connection — useful for container healthchecks
 * to distinguish "process up, DB unreachable" from fully healthy.
 */

import { Router } from "express";
import { isDbConnected } from "../../db/mongoose";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "pawball-api",
      timestamp: new Date().toISOString(),
      db: isDbConnected() ? "connected" : "disconnected",
    },
  });
});
