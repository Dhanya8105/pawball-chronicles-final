/**
 * apps/api/test/cv.service.test.ts
 *
 * The no-key mock path and the pure JSON-parse / normalise helpers of the
 * in-process CV service. The one real network call (`callGemini`) is
 * exercised manually against the running stack, not here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config reads GEMINI_API_KEY at import time; control it per-test.
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;

async function loadCvService() {
  vi.resetModules();
  return import("../src/modules/capture/cv.service");
}

describe("cv.service", () => {
  beforeEach(() => {
    // Set (not delete) to "" so `dotenv/config` in config/index.ts — which
    // only fills *unset* keys — can't repopulate it from apps/api/.env.
    process.env.GEMINI_API_KEY = "";
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
  });

  it("analyzeImage returns a labelled mock when GEMINI_API_KEY is unset", async () => {
    const cv = await loadCvService();
    const result = await cv.analyzeImage("https://res.cloudinary.com/x/cat.jpg");
    expect(result.mock).toBe(true);
    expect(result.isCat).toBe(true);
    expect(result.breed.label).toBe("Domestic Shorthair");
    expect(result.confidence).toBe(0);
    expect(result.breed.confidence).toBe(0);
  });

  it("mockResult is a complete, schema-shaped object", async () => {
    const cv = await loadCvService();
    const m = cv.mockResult();
    expect(m.pose.label).toBe("sitting");
    expect(m.eyeOpenness.label).toBe("open");
    expect(m.earOrientation.label).toBe("relaxed");
    expect(m.estimatedAgeGroup.label).toBe("adult");
    expect(m.coat).toEqual({ color: "unknown", pattern: "unknown", confidence: 0 });
    expect(m.surroundings).toEqual([]);
  });

  it("extractJson strips a ```json fence", async () => {
    const cv = await loadCvService();
    const payload = { isCat: true, confidence: 0.9 };
    expect(cv.extractJson("```json\n" + JSON.stringify(payload) + "\n```")).toEqual(
      payload
    );
  });

  it("extractJson strips surrounding prose", async () => {
    const cv = await loadCvService();
    const payload = { isCat: false, confidence: 0.1 };
    expect(
      cv.extractJson("Here you go: " + JSON.stringify(payload) + " (done)")
    ).toEqual(payload);
  });

  it("extractJson throws CvAnalysisError on unparseable text", async () => {
    const cv = await loadCvService();
    expect(() => cv.extractJson("not json at all")).toThrow(cv.CvAnalysisError);
  });

  it("toResult maps camelCase, clamps surroundings to 4, defaults missing", async () => {
    const cv = await loadCvService();
    const r = cv.toResult({
      isCat: true,
      confidence: 0.88,
      breed: { label: "Bengal", confidence: 0.6 },
      pose: { label: "loaf", confidence: 0.7 },
      faceOrientation: { label: "front", confidence: 0.5 },
      eyeOpenness: { label: "half", confidence: 0.4 },
      earOrientation: { label: "alert", confidence: 0.55 },
      tailVisible: true,
      coat: { color: "black-and-white", pattern: "bicolor", confidence: 0.9 },
      estimatedAgeGroup: { label: "adult", confidence: 0.7 },
      surroundings: [
        { label: "forest", confidence: 0.6 },
        { label: "trees", confidence: 0.5 },
        { label: "grass", confidence: 0.4 },
        { label: "rocks", confidence: 0.3 },
        { label: "sky", confidence: 0.2 },
      ],
    });
    expect(r.mock).toBe(false);
    expect(r.eyeOpenness.label).toBe("half");
    expect(r.coat.color).toBe("black-and-white");
    expect(r.surroundings).toHaveLength(4);
    expect(r.surroundings[4]).toBeUndefined();
  });

  it("toResult handles a non-cat null-heavy payload", async () => {
    const cv = await loadCvService();
    const r = cv.toResult({
      isCat: false,
      confidence: 0.05,
      breed: null,
      pose: null,
      faceOrientation: null,
      eyeOpenness: null,
      earOrientation: null,
      tailVisible: false,
      coat: null,
      estimatedAgeGroup: null,
      surroundings: [],
    });
    expect(r.isCat).toBe(false);
    expect(r.breed).toEqual({ label: "unknown", confidence: 0 });
    expect(r.coat).toEqual({ color: "unknown", pattern: "unknown", confidence: 0 });
    expect(r.surroundings).toEqual([]);
  });
});
