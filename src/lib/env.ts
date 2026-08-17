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

/** Secret for signing dashboard session cookies. Falls back to the token
 *  encryption key so dev works without extra config. Fails loud if neither is
 *  set — an empty key would let anyone forge a session cookie. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET (or TOKEN_ENCRYPTION_KEY) must be set to a strong value for session signing.",
    );
  }
  return secret;
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

/**
 * Supabase Storage config for uploading product images. Needs the project URL
 * (https://<ref>.supabase.co) and a service-role key (server-side only — never
 * exposed to the client). Returns null when not configured so the upload UI can
 * hide itself gracefully.
 */
export function getSupabaseStorage(): { url: string; serviceKey: string } | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}
