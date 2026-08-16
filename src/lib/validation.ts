import { z } from "zod";

/**
 * Shared input validators for form/server-action data. Centralizes the money /
 * stock / slug rules so invalid submissions are coerced safely (or rejected)
 * instead of each action hand-parsing.
 */

const moneyNumber = z.coerce
  .number()
  .refine((n) => Number.isFinite(n) && n >= 0, "invalid amount");

/** Non-negative money as a 2-decimal string ("0.00" for invalid input). */
export function toMoney(v: unknown): string {
  const parsed = moneyNumber.safeParse(v);
  const n = parsed.success ? parsed.data : 0;
  return (Math.round(n * 100) / 100).toFixed(2);
}

const stockNumber = z.coerce.number().int().min(0);

/** Stock as a non-negative int, or null for empty/invalid ("ไม่จำกัด"). */
export function toStock(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const parsed = stockNumber.safeParse(s);
  return parsed.success ? parsed.data : null;
}

const slugSchema = z
  .string()
  .transform((s) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  )
  .pipe(z.string().min(1).max(60));

/** URL-safe slug, or null if nothing usable remains. */
export function toSlug(v: unknown): string | null {
  const r = slugSchema.safeParse(String(v ?? ""));
  return r.success ? r.data : null;
}

/**
 * Accept only a public HTTPS image URL (LINE/Messenger require https + JPEG/PNG).
 * Returns the trimmed URL, or null if empty/invalid — so a bad paste never
 * becomes a broken image the bot tries to send.
 */
export function toImageUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^https:\/\/.+/i.test(s)) return null;
  if (s.length > 2048) return null;
  return s;
}

/**
 * Strip Markdown so AI replies read like a human typed them in LINE/Messenger
 * (which show `**` and `#` literally, making the bot obvious). Keeps the text.
 */
export function toPlainText(input: string): string {
  return input
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold**
    .replace(/__([^_]+)__/g, "$1") // __bold__
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2") // *italic*
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // `code`
    .replace(/^#{1,6}\s+/gm, "") // # headings
    .replace(/^\s*[-*•]\s+/gm, "") // - bullet points -> plain lines
    .replace(/\n{3,}/g, "\n\n") // collapse blank runs
    .trim();
}
