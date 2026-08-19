import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Password hashing with Node's built-in scrypt (no external dependency). Format:
// "<saltHex>:<hashHex>". scrypt is memory-hard and a sound choice for passwords.

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const actual = scryptSync(password, salt, KEYLEN);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
