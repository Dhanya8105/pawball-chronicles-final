/**
 * apps/api/src/modules/collection/collection.router.ts
 *
 * GET /api/v1/collection         — search/filter/sort/paginate the caller's PawBalls
 * GET /api/v1/collection/stats   — counts by rarity / bond level / breed / region
 *
 * (docs/architecture/04-api-contracts.md §Collection)
 */

import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { parsePageParams } from "../../lib/pagination";
import { collectionStats, queryCollection } from "./collection.service";

export const collectionRouter = Router();

collectionRouter.use(requireAuth);

collectionRouter.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize, skip } = parsePageParams(req.query);
    const data = await queryCollection({
      ownerId: req.userId!,
      q: strOrUndefined(req.query.q),
      sortBy: strOrUndefined(req.query.sortBy),
      rarity: strOrUndefined(req.query.rarity),
      breed: strOrUndefined(req.query.breed),
      regionId: strOrUndefined(req.query.regionId),
      bondLevel: strOrUndefined(req.query.bondLevel),
      page,
      pageSize,
      skip,
    });
    res.status(200).json({ success: true, data });
  })
);

collectionRouter.get(
  "/stats",
  asyncHandler(async (req: Request, res: Response) => {
    const data = await collectionStats(req.userId!);
    res.status(200).json({ success: true, data });
  })
);

function strOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
