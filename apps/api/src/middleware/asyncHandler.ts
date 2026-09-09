/**
 * apps/api/src/middleware/asyncHandler.ts
 *
 * Express 4 does not catch rejected promises from async route handlers —
 * an unhandled rejection would crash the process instead of reaching
 * errorHandler. Every async controller gets wrapped with this so
 * `throw new ApiError(...)` inside an `async` function correctly flows to
 * next(err) without each controller needing its own try/catch.
 */

import type { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
