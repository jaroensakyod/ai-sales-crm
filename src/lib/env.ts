/**
 * Centralized environment access. Fail loud at first use if a required var
 * is missing, instead of passing `undefined` into a DB/AI client.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Supabase TRANSACTION pooler URL (port :6543).
 * Must be the pooler, not the direct :5432 connection, for serverless routes.
 */
export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

export function getGeminiApiKey(): string {
  return required("GEMINI_API_KEY");
}

/** True if a Gemini key is configured — used to enable Level 3 gracefully. */
export function hasGeminiApiKey(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * 32-byte AES-256 key for encrypting channel tokens at rest (risk #7).
 * Stored as base64 in TOKEN_ENCRYPTION_KEY. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function getTokenEncryptionKey(): Buffer {
  const key = Buffer.from(required("TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).",
    );
  }
  return key;
}
