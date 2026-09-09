/**
 * apps/api/src/modules/pawball/pawball.router.ts
 *
 * GET   /api/v1/pawballs/:id                      — full detail
 * GET   /api/v1/pawballs/:id/timeline             — merged sightings + memories
 * GET   /api/v1/pawballs/:id/sightings            — raw sighting history
 * GET   /api/v1/pawballs/:id/memories?type=       — memories feed (weekly life etc.)
 * PATCH /api/v1/pawballs/:id/favorite-resting-place
 *
 * (docs/architecture/04-api-contracts.md §PawBall + §Weekly Life)
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { parsePageParams } from "../../lib/pagination";
import { favoriteRestingPlaceSchema } from "./pawball.validators";
import {
  getPawballDetail,
  getPawballMemories,
  getPawballSightings,
  getPawballTimeline,
  setFavoriteRestingPlace,
} from "./pawball.service";

export const pawballRouter = Router();

pawballRouter.use(requireAuth);

pawballRouter.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getPawballDetail(req.params.id, req.userId!);
    res.status(200).json({ success: true, data });
  })
);

pawballRouter.get(
  "/:id/timeline",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getPawballTimeline(
      req.params.id,
      req.userId!,
      parsePageParams(req.query)
    );
    res.status(200).json({ success: true, data });
  })
);

pawballRouter.get(
  "/:id/sightings",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await getPawballSightings(
      req.params.id,
      req.userId!,
      parsePageParams(req.query)
    );
    res.status(200).json({ success: true, data });
  })
);

pawballRouter.get(
  "/:id/memories",
  asyncHandler(async (req: Request, res: Response) => {
    const type =
      typeof req.query.type === "string" ? req.query.type : undefined;
    const data = await getPawballMemories(
      req.params.id,
      req.userId!,
      parsePageParams(req.query),
      type
    );
    res.status(200).json({ success: true, data });
  })
);

pawballRouter.patch(
  "/:id/favorite-resting-place",
  asyncHandler(async (req: Request, res: Response) => {
    const place = favoriteRestingPlaceSchema.parse(req.body);
    const data = await setFavoriteRestingPlace(
      req.params.id,
      req.userId!,
      place
    );
    res.status(200).json({ success: true, data });
  })
);
