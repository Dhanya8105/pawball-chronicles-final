import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/modules/auth/jwt";

describe("jwt", () => {
  it("signs and verifies an access token round-trip", () => {
    const token = signAccessToken({ sub: "user-123", email: "a@b.com" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("a@b.com");
  });

  it("signs and verifies a refresh token round-trip", () => {
    const token = signRefreshToken({ sub: "user-123", jti: "jti-abc" });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.jti).toBe("jti-abc");
  });

  it("rejects a garbage token", () => {
    expect(() => verifyAccessToken("not-a-jwt")).toThrow();
  });

  it("rejects an access token when verified as a refresh token (different secrets)", () => {
    const accessToken = signAccessToken({ sub: "user-123", email: "a@b.com" });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});
