import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.service).toBe("pawball-api");
    // This test suite never calls connectDb(), so db should honestly
    // report disconnected rather than a stale/fake "connected".
    expect(res.body.data.db).toBe("disconnected");
  });
});

describe("GET /unknown-route", () => {
  it("returns 404 with the standard error shape", async () => {
    const app = createApp();
    const res = await request(app).get("/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
