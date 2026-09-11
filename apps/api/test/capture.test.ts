import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mocked before importing the app, since cloudinary.ts requires real
// credentials to configure the SDK — tests shouldn't need a real
// Cloudinary account to verify the capture flow's own logic (auth gating,
// validation, persistence, pagination).
vi.mock("../src/lib/cloudinary", () => ({
  uploadOriginalCapture: vi.fn().mockResolvedValue(
    "https://res.cloudinary.com/test/image/upload/mock-capture.jpg"
  ),
}));

import { createApp } from "../src/app";
import { setupTestDb } from "./setupDb";

const app = createApp();
setupTestDb();

async function registerAndGetToken(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "supersecret123",
    displayName: "Capture Tester",
  });
  return res.body.data.accessToken;
}

const tinyPngBuffer = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108020000009077" +
    "3df40000000a4944415478da6364000000050001a5f645400000000049454e44ae426082",
  "hex"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/captures", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app)
      .post("/api/v1/captures")
      .field("lat", "12.97")
      .field("lng", "77.59")
      .attach("image", tinyPngBuffer, "cat.png");
    expect(res.status).toBe(401);
  });

  it("runs the pipeline synchronously and returns the finished card when Redis is disabled", async () => {
    // `npm test` sets no REDIS_URL, so createCapture runs the CV +
    // deterministic pipeline inline and the response already carries the
    // built PawBall (no polling). GEMINI_API_KEY and FAL_API_KEY are unset
    // here too, so the CV, lore, and artwork steps all return their
    // labelled/templated/original-photo fallbacks — enough to drive the
    // pipeline end to end.
    const token = await registerAndGetToken("capture1@pawball.test");

    const res = await request(app)
      .post("/api/v1/captures")
      .set("Authorization", `Bearer ${token}`)
      .field("lat", "12.97")
      .field("lng", "77.59")
      .attach("image", tinyPngBuffer, "cat.png");

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("complete");
    expect(typeof res.body.data.captureId).toBe("string");
    expect(res.body.data.pawball).toBeTruthy();
    expect(typeof res.body.data.pawball.identity.fantasyName).toBe("string");
    expect(typeof res.body.data.pawball.loreText).toBe("string");
    expect(res.body.data.pawball.loreText.length).toBeGreaterThan(0);
    expect(typeof res.body.data.pawball.personality).toBe("string");
    expect(res.body.data.pawball.personality.length).toBeGreaterThan(0);
    // No FAL_API_KEY -> artwork falls back to the original capture photo.
    expect(res.body.data.pawball.artwork.currentImageUrl).toBe(
      res.body.data.pawball.originalPhotoUrl
    );
    expect(res.body.data.bondResult.isNewPawball).toBe(true);
  });

  it("rejects requests with no image attached", async () => {
    const token = await registerAndGetToken("capture2@pawball.test");
    const res = await request(app)
      .post("/api/v1/captures")
      .set("Authorization", `Bearer ${token}`)
      .field("lat", "12.97")
      .field("lng", "77.59");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("CAPTURE_IMAGE_REQUIRED");
  });

  it("rejects out-of-range coordinates", async () => {
    const token = await registerAndGetToken("capture3@pawball.test");
    const res = await request(app)
      .post("/api/v1/captures")
      .set("Authorization", `Bearer ${token}`)
      .field("lat", "999")
      .field("lng", "77.59")
      .attach("image", tinyPngBuffer, "cat.png");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/captures/:id", () => {
  it("returns a capture belonging to the requesting user", async () => {
    const token = await registerAndGetToken("capture4@pawball.test");
    const createRes = await request(app)
      .post("/api/v1/captures")
      .set("Authorization", `Bearer ${token}`)
      .field("lat", "12.97")
      .field("lng", "77.59")
      .attach("image", tinyPngBuffer, "cat.png");

    const res = await request(app)
      .get(`/api/v1/captures/${createRes.body.data.captureId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.originalImageUrl).toContain("cloudinary");
  });

  it("does not return another user's capture", async () => {
    const tokenA = await registerAndGetToken("ownerA@pawball.test");
    const tokenB = await registerAndGetToken("ownerB@pawball.test");

    const createRes = await request(app)
      .post("/api/v1/captures")
      .set("Authorization", `Bearer ${tokenA}`)
      .field("lat", "12.97")
      .field("lng", "77.59")
      .attach("image", tinyPngBuffer, "cat.png");

    const res = await request(app)
      .get(`/api/v1/captures/${createRes.body.data.captureId}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("CAPTURE_NOT_FOUND");
  });
});

describe("GET /api/v1/captures", () => {
  it("lists only the requesting user's captures, newest first", async () => {
    const token = await registerAndGetToken("capture5@pawball.test");

    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/v1/captures")
        .set("Authorization", `Bearer ${token}`)
        .field("lat", "12.97")
        .field("lng", "77.59")
        .attach("image", tinyPngBuffer, "cat.png");
    }

    const res = await request(app)
      .get("/api/v1/captures")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.items).toHaveLength(3);
  });
});
