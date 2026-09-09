/**
 * apps/api/src/lib/aiServiceClient.ts
 *
 * Thin client for apps/api -> services/ai calls. Matches the request/
 * response shapes in docs/architecture/03-ai-pipeline.md exactly (snake_case
 * on the wire, since that's services/ai's Pydantic convention — converted
 * to camelCase here so the rest of apps/api never has to think about which
 * service's naming convention it's looking at).
 */

import { config } from "../config";

export interface CvConfidenceValue {
  label: string;
  confidence: number;
}

export interface CvCoatResult {
  color: string;
  pattern: string;
  confidence: number;
}

export interface CvSurroundingLabel {
  label: string;
  confidence: number;
}

export interface CvAnalysisResult {
  isCat: boolean;
  confidence: number;
  breed: CvConfidenceValue;
  pose: CvConfidenceValue;
  faceOrientation: CvConfidenceValue;
  eyeOpenness: CvConfidenceValue;
  earOrientation: CvConfidenceValue;
  tailVisible: boolean;
  coat: CvCoatResult;
  estimatedAgeGroup: CvConfidenceValue;
  surroundings: CvSurroundingLabel[];
}

export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

/** AI-service-unavailable is modeled as a distinct error type (rather than
 * just a generic AiServiceError) so the BullMQ worker can decide to retry
 * (transient: model not loaded yet, service restarting) versus fail
 * permanently (e.g. a malformed image URL, which retrying won't fix). */
export class AiServiceUnavailableError extends AiServiceError {
  constructor(message: string) {
    super(message, 503);
  }
}

function snakeToCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
        snakeToCamel(value),
      ])
    );
  }
  return obj;
}

export async function analyzeCaptureImage(imageUrl: string): Promise<CvAnalysisResult> {
  const res = await fetch(`${config.aiServiceUrl}/cv/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });

  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiServiceUnavailableError(
      body.detail ?? "AI service models are not available."
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new AiServiceError(
      body.detail ?? `AI service returned ${res.status}`,
      res.status
    );
  }

  const body = await res.json();
  return snakeToCamel(body) as CvAnalysisResult;
}
