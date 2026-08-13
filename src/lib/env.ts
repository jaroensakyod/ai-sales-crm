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
