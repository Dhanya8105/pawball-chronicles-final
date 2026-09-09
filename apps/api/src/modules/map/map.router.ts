/**
 * apps/api/src/modules/map/map.router.ts
 *
 * GET /api/v1/map/markers?bbox=minLng,minLat,maxLng,maxLat  — viewport markers
 * GET /api/v1/map/markers/:pawballId                        — full popup payload
 *
 * (docs/architecture/04-api-contracts.md §Map)
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { markerDetail, markersInBox, parseBBox } from "./map.service";

export const mapRouter = Router();

mapRouter.use(requireAuth);

mapRouter.get(
  "/markers",
  asyncHandler(async (req: Request, res: Response) => {
    const box = parseBBox(req.query.bbox);
    const data = await markersInBox(req.userId!, box);
    res.status(200).json({ success: true, data });
  })
);

mapRouter.get(
  "/markers/:pawballId",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await markerDetail(req.userId!, req.params.pawballId);
    res.status(200).json({ success: true, data });
  })
);
