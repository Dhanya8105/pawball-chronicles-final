/**
 * apps/api/src/middleware/upload.ts
 *
 * Memory storage (not disk) since the buffer is immediately streamed to
 * Cloudinary and never needs to touch the local filesystem — avoids
 * leftover temp files and works identically across container/serverless
 * deployment targets. 10MB cap and image-only mimetype filter reject
 * obviously-wrong uploads before they reach any business logic.
 */

import multer from "multer";
import { ApiError } from "./errorHandler";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(
        new ApiError(400, "VALIDATION_ERROR", "Uploaded file must be an image.")
      );
      return;
    }
    callback(null, true);
  },
});
