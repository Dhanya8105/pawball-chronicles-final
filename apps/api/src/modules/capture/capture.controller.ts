/**
 * apps/api/src/modules/capture/capture.controller.ts
 */

import type { Request, Response } from "express";
import { ApiError } from "../../middleware/errorHandler";
import { createCaptureFieldsSchema } from "./capture.validators";
import * as captureService from "./capture.service";

export async function createCaptureHandler(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new ApiError(400, "CAPTURE_IMAGE_REQUIRED", "An image file is required.");
  }

  const fields = createCaptureFieldsSchema.parse(req.body);

  const capture = await captureService.createCapture({
    ownerId: req.userId!,
    imageBuffer: req.file.buffer,
    lat: fields.lat,
    lng: fields.lng,
    capturedAt: fields.capturedAt,
  });

  res.status(201).json({
    success: true,
    data: { captureId: capture._id.toString(), status: capture.status },
  });
}

export async function getCaptureHandler(req: Request, res: Response): Promise<void> {
  const capture = await captureService.getCaptureById(req.params.id, req.userId!);
  res.status(200).json({ success: true, data: capture });
}

export async function listCapturesHandler(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

  const result = await captureService.listCaptures(req.userId!, page, pageSize);
  res.status(200).json({ success: true, data: result });
}
