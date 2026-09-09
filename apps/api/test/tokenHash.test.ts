import { describe, expect, it } from "vitest";
import { hashToken } from "../src/modules/auth/tokenHash";

describe("hashToken", () => {
  it("produces a deterministic hash for the same input", () => {
    const token = "some-refresh-token-value";
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("never returns the raw input", () => {
    const token = "some-refresh-token-value";
    expect(hashToken(token)).not.toBe(token);
  });

  it("produces a 64-character hex string (sha256)", () => {
    const hash = hashToken("anything");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
