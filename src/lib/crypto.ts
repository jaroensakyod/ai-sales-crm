import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { getTokenEncryptionKey } from "@/lib/env";

/**
 * Authenticated encryption for secrets at rest — Facebook/LINE tokens live in
 * the DB as ciphertext, never plaintext and never a single env var (risk #7).
 *
 * Format:  v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 * AES-256-GCM gives confidentiality + integrity (tag detects tampering).
 */
const ALGO = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard

export function encryptSecret(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted secret");
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`Unsupported secret version: ${version}`);
  }
  const key = getTokenEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(), // throws if the auth tag doesn't match (tampered/ wrong key)
  ]);
  return plaintext.toString("utf8");
}

/** Constant-time compare for webhook signatures etc. (avoid timing leaks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
