import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const h = hashPassword("s3cret-pw");
    expect(verifyPassword("s3cret-pw", h)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const h = hashPassword("s3cret-pw");
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "nonsense")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});
