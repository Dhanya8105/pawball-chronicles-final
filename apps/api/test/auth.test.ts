import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { setupTestDb } from "./setupDb";

const app = createApp();
setupTestDb();

const validUser = {
  email: "whiskers@pawball.test",
  password: "supersecret123",
  displayName: "Whiskers Fan",
};

describe("POST /api/v1/auth/register", () => {
  it("creates a user and returns a token pair", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(res.body.data.user.displayName).toBe(validUser.displayName);
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
    // password must never be echoed back in any form
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const res = await request(app).post("/api/v1/auth/register").send(validUser);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("AUTH_EMAIL_TAKEN");
  });

  it("rejects a short password with a validation error", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validUser, email: "short@pawball.test", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/v1/auth/login", () => {
  it("logs in with correct credentials", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects an incorrect password", async () => {
    await request(app).post("/api/v1/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: validUser.email, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects a nonexistent email with the same error as wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@pawball.test", password: "whatever123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_INVALID_CREDENTIALS");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the current user when authenticated", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send(validUser);
    const { accessToken } = registerRes.body.data;

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(validUser.email);
  });

  it("rejects requests with no Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("rejects requests with a garbage token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_EXPIRED");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("issues a new token pair and revokes the old refresh token", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send(validUser);
    const { refreshToken: originalRefreshToken } = registerRes.body.data;

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: originalRefreshToken });
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.accessToken).toBe("string");
    expect(refreshRes.body.data.refreshToken).not.toBe(originalRefreshToken);

    // the original token must now be dead (rotation)
    const reuseRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: originalRefreshToken });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("rejects a malformed refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "garbage" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_TOKEN_INVALID");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes the refresh token so it can no longer be used", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send(validUser);
    const { refreshToken } = registerRes.body.data;

    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.loggedOut).toBe(true);

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it("is idempotent when called twice", async () => {
    const registerRes = await request(app).post("/api/v1/auth/register").send(validUser);
    const { refreshToken } = registerRes.body.data;

    await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    const secondRes = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
    expect(secondRes.status).toBe(200);
  });
});
