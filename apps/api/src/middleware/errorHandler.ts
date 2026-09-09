/**
 * apps/api/src/middleware/errorHandler.ts
 *
 * Single error-handling middleware mounted last in the app. Modules throw
 * ApiError (or let unexpected errors bubble) and this normalizes every
 * response into the { success, error: { code, message } } shape defined in
 * docs/architecture/04-api-contracts.md, so the frontend never has to
 * special-case error shapes per-endpoint.
 */

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryAfterSeconds?: number;
  public readonly stage?: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    extra?: { retryAfterSeconds?: number; stage?: string }
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
    this.stage = extra?.stage;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.retryAfterSeconds !== undefined && {
          retryAfterSeconds: err.retryAfterSeconds,
        }),
        ...(err.stage !== undefined && { stage: err.stage }),
      },
    });
    return;
  }

  // Zod throws directly when controllers call schema.parse() outside the
  // validateBody middleware (e.g. parsing multipart form fields after
  // multer has already run) — normalize it the same way validateBody does,
  // so callers get one consistent VALIDATION_ERROR shape either path.
  if (err instanceof ZodError) {
    const message = err.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message },
    });
    return;
  }

  // Mongoose duplicate-key error (e.g. a race between two concurrent
  // registrations for the same email slipping past the findOne check) —
  // surfaced as a clean 409 rather than a raw 500.
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  ) {
    res.status(409).json({
      success: false,
      error: {
        code: "AUTH_EMAIL_TAKEN",
        message: "An account with this email already exists.",
      },
    });
    return;
  }

  // Unexpected error — log full detail server-side, return a safe generic
  // message to the client so internals never leak.
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
}
