/**
 * apps/api/test/aiServiceClient.test.ts
 *
 * Mocks global fetch to test the client's own logic (snake->camel
 * conversion, status-code-to-error-type mapping) in isolation from an
 * actual running services/ai process.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeCaptureImage,
  AiServiceError,
  AiServiceUnavailableError,
} from "../src/lib/aiServiceClient";

describe("analyzeCaptureImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converts snake_case response fields to camelCase", async () => {
    const fakeResponse = {
      is_cat: true,
      confidence: 0.9,
      breed: { label: "Bengal", confidence: 0.6 },
      estimated_age_group: { label: "adult", confidence: 0.7 },
      surroundings: [{ label: "street", confidence: 0.4 }],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => fakeResponse,
      })
    );

    const result = await analyzeCaptureImage("https://example.com/cat.jpg");

    expect(result.isCat).toBe(true);
    expect(result.estimatedAgeGroup).toEqual({ label: "adult", confidence: 0.7 });
    // surroundings is an array of objects with already-camelCase keys
    // (label, confidence) — verifies array elements are recursed into, not
    // just top-level keys
    expect(result.surroundings).toEqual([{ label: "street", confidence: 0.4 }]);
  });

  it("throws AiServiceUnavailableError on a 503 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Model 'yolov8n' is not available" }),
      })
    );

    await expect(analyzeCaptureImage("https://example.com/cat.jpg")).rejects.toThrow(
      AiServiceUnavailableError
    );
  });

  it("throws the generic AiServiceError on other non-2xx responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: "Could not load image" }),
      })
    );

    await expect(analyzeCaptureImage("https://example.com/cat.jpg")).rejects.toThrow(
      AiServiceError
    );
  });
});
