import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, safeEqual } from "@/lib/crypto";

describe("secret encryption (AES-256-GCM)", () => {
  beforeAll(() => {
    // Deterministic key for the test run; unrelated to the real .env key.
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  it("round-trips a token", () => {
    const token = "EAAG_line_or_fb_access_token_1234567890";
    const enc = encryptSecret(token);
    expect(enc).not.toContain(token); // ciphertext, not plaintext
    expect(enc.startsWith("v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-token");
    const b = encryptSecret("same-token");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("rejects a tampered ciphertext (auth tag)", () => {
    const enc = encryptSecret("do-not-tamper");
    const [v, iv, tag, ct] = enc.split(":");
    // Flip the last byte of the ciphertext.
    const buf = Buffer.from(ct, "base64");
    buf[buf.length - 1] ^= 0x01;
    const tampered = [v, iv, tag, buf.toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("safeEqual compares correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
