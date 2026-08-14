import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

import { hashPassword, verifyPassword } from "@/lib/password";
import { signSession, verifySession } from "@/lib/session";

describe("password hashing (scrypt)", () => {
  it("round-trips and rejects wrong passwords", () => {
    const hash = hashPassword("s3cret!");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("s3cret!", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
  it("uses a random salt (different hashes per call)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("signed session", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  });

  const base = {
    userId: "u1",
    tenantId: "t1",
    tenantSlug: "shop",
    role: "ADMIN",
  };

  it("signs and verifies a payload", () => {
    const token = signSession(base);
    const payload = verifySession(token);
    expect(payload?.userId).toBe("u1");
    expect(payload?.role).toBe("ADMIN");
  });

  it("rejects a tampered token", () => {
    const token = signSession(base);
    const [body] = token.split(".");
    expect(verifySession(`${body}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const token = signSession(base, now - 30 * 24 * 60 * 60 * 1000);
    expect(verifySession(token, now)).toBeNull();
  });

  it("rejects empty/garbage", () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("garbage")).toBeNull();
  });
});
