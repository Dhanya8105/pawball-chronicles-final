/**
 * apps/api/src/middleware/validate.ts
 *
 * Wraps a Zod schema as Express middleware. On failure, throws ApiError so
 * the existing centralized errorHandler produces the standard response
 * shape — validation errors never need their own special-cased handler.
 */

import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "./errorHandler";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      next(new ApiError(400, "VALIDATION_ERROR", message));
      return;
    }
    req.body = result.data;
    next();
  };
}
