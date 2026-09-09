/**
 * apps/api/src/modules/capture/capture.routes.ts
 */

import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { uploadImage } from "../../middleware/upload";
import {
  createCaptureHandler,
  getCaptureHandler,
  listCapturesHandler,
} from "./capture.controller";

export const captureRouter = Router();

captureRouter.use(requireAuth);

captureRouter.post("/", uploadImage.single("image"), asyncHandler(createCaptureHandler));
captureRouter.get("/", asyncHandler(listCapturesHandler));
captureRouter.get("/:id", asyncHandler(getCaptureHandler));
