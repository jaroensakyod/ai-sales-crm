import { describe, expect, it } from "vitest";

import {
  computeFacebookSignature,
  verifyFacebookSignature,
} from "@/features/facebook/signature";

describe("facebook signature", () => {
  const secret = "app-secret-123";
  const body = JSON.stringify({ object: "page", entry: [] });

  it("computes a sha256= header", () => {
    expect(computeFacebookSignature(secret, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("verifies a correct signature", () => {
    const sig = computeFacebookSignature(secret, body);
    expect(verifyFacebookSignature(secret, body, sig)).toBe(true);
  });

  it("rejects a wrong signature or missing header", () => {
    expect(verifyFacebookSignature(secret, body, "sha256=deadbeef")).toBe(false);
    expect(verifyFacebookSignature(secret, body, null)).toBe(false);
  });
});
