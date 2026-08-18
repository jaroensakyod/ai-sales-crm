import { beforeAll, describe, expect, it } from "vitest";

import {
  facebookConnectUrl,
  signState,
  verifyState,
} from "@/features/facebook/oauth";

beforeAll(() => {
  process.env.META_APP_SECRET = "test-secret";
  process.env.META_APP_ID = "123456";
});

describe("facebook connect OAuth state", () => {
  it("round-trips a signed state", () => {
    const state = signState({ slug: "demo-store", nonce: "abc123" });
    expect(verifyState(state)).toEqual({ slug: "demo-store", nonce: "abc123" });
  });

  it("rejects a tampered slug", () => {
    const state = signState({ slug: "demo-store", nonce: "abc123" });
    const [body, sig] = state.split(".");
    // Swap the body for a forged one but keep the old signature.
    const forged = Buffer.from(
      JSON.stringify({ slug: "victim-store", nonce: "abc123" }),
    ).toString("base64url");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    // Original still verifies.
    expect(verifyState(`${body}.${sig}`)).not.toBeNull();
  });

  it("rejects malformed state", () => {
    expect(verifyState("nonsense")).toBeNull();
    expect(verifyState("")).toBeNull();
  });

  it("builds a dialog URL with app id, scopes, and redirect", () => {
    const url = facebookConnectUrl("https://app.example.com/cb", "STATE");
    expect(url).toContain("client_id=123456");
    expect(url).toContain("pages_messaging");
    expect(url).toContain(encodeURIComponent("https://app.example.com/cb"));
    expect(url).toContain("state=STATE");
  });
});
