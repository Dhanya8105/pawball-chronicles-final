/**
 * apps/api/src/lib/cloudinary.ts
 *
 * apps/api owns uploading the user's *original* capture photo (it's the
 * one receiving the multipart upload from the client). services/ai owns
 * uploading *generated* artwork (it's the one producing those bytes) — see
 * services/ai/app/utils/cloudinary_client.py. Each service uploads what it
 * itself produces/receives; neither proxies binary data to the other over
 * HTTP, per docs/architecture/01-system-architecture.md's storage ownership
 * section.
 */

import { v2 as cloudinary } from "cloudinary";
import { config } from "../config";
import { ApiError } from "../middleware/errorHandler";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new ApiError(
      503,
      "CAPTURE_PIPELINE_FAILED",
      "Image storage is not configured on this server.",
      { stage: "upload" }
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
  configured = true;
}

export async function uploadOriginalCapture(
  buffer: Buffer,
  ownerId: string
): Promise<string> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `pawball/originals/${ownerId}`, resource_type: "image" },
      (error, result) => {
        if (error || !result) {
          reject(
            new ApiError(502, "CAPTURE_PIPELINE_FAILED", "Image upload failed.", {
              stage: "upload",
            })
          );
          return;
        }
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
