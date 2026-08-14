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
