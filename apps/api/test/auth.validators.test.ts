import { describe, expect, it } from "vitest";
import {
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from "../src/modules/auth/auth.validators";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      email: "a@b.com",
      password: "longenough123",
      displayName: "Cat Lover",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "longenough123",
      displayName: "Cat Lover",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "a@b.com",
      password: "short",
      displayName: "Cat Lover",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty display name", () => {
    const result = registerSchema.safeParse({
      email: "a@b.com",
      password: "longenough123",
      displayName: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "anything" }).success
    ).toBe(true);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(
      false
    );
  });
});

describe("googleAuthSchema", () => {
  it("accepts a non-empty idToken", () => {
    expect(googleAuthSchema.safeParse({ idToken: "abc" }).success).toBe(true);
  });

  it("rejects an empty idToken", () => {
    expect(googleAuthSchema.safeParse({ idToken: "" }).success).toBe(false);
  });
});

describe("refreshSchema and logoutSchema", () => {
  it("both require a non-empty refreshToken", () => {
    expect(refreshSchema.safeParse({ refreshToken: "x" }).success).toBe(true);
    expect(refreshSchema.safeParse({ refreshToken: "" }).success).toBe(false);
    expect(logoutSchema.safeParse({ refreshToken: "x" }).success).toBe(true);
    expect(logoutSchema.safeParse({}).success).toBe(false);
  });
});
