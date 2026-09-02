/**
 * Pure intent detection + product matching for Message Router Level 1.
 * No DB, no AI — cheap keyword/substring logic so it works even if Gemini is
 * down (risk #6) and never spends a token on a question the rules can answer.
 */

const PRICE_KEYWORDS = [
  "ราคา",
  "เท่าไหร่",
  "เท่าไร",
  "กี่บาท",
  "กีบาท",
  "how much",
  "price",
  "cost",
];

const STOCK_KEYWORDS = [
  "มีของ",
  "มีไหม",
  "มียัง",
  "มีมั้ย",
  "สต็อก",
  "สต๊อก",
  "เหลือ",
  "พร้อมส่ง",
  "ของหมด",
  "หมดไหม",
  "in stock",
  "available",
  "stock",
];

// Refund / dispute / complaint → straight to a human (Message Router Level 4).
const HANDOFF_KEYWORDS = [
  "คืนเงิน",
  "คืนสินค้า",
  "ขอเงินคืน",
  "ยกเลิกออเดอร์",
  "ยกเลิกคำสั่งซื้อ",
  "ร้องเรียน",
  "เคลม",
  "ฟ้อง",
  "ทนาย",
  "โกง",
  "หลอกลวง",
  "refund",
  "chargeback",
  "complaint",
  "dispute",
  "scam",
  // Explicit "I want a human" — also fired by the "คุยกับแอดมิน" quick-reply chip.
  "คุยกับแอดมิน",
  "ขอคุยกับแอดมิน",
  "ติดต่อแอดมิน",
  "ขอแอดมิน",
  "คุยกับคน",
  "talk to a human",
  "talk to admin",
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function containsAny(text: string, keywords: string[]): string | null {
  const n = normalize(text);
  for (const kw of keywords) {
    if (n.includes(normalize(kw))) return kw;
  }
  return null;
}

export function hasPriceIntent(text: string): boolean {
  return containsAny(text, PRICE_KEYWORDS) !== null;
}

export function hasStockIntent(text: string): boolean {
  return containsAny(text, STOCK_KEYWORDS) !== null;
}

/** Returns the matched handoff keyword, or null. */
export function matchHandoff(text: string): string | null {
  return containsAny(text, HANDOFF_KEYWORDS);
}

export type VariantLike = {
  id: string;
  name: string;
  sku: string | null;
  price: string | null;
};

export type ProductLike = {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  stock: number | null;
  currency: string;
  description?: string | null;
  aiKnowledge?: string | null;
  imageUrl?: string | null;
  variants?: VariantLike[];
};

/**
 * Lowercased match aliases for a product: full name, the leading segment before
 * the first space (Thai compounds have no internal spaces), and the SKU.
 * Aliases shorter than 3 chars are dropped to avoid spurious hits.
 */
export function productAliases(p: Pick<ProductLike, "name" | "sku">): string[] {
  const raw = [p.name, p.name.split(/\s+/)[0], p.sku ?? ""];
  const seen = new Set<string>();
  for (const a of raw) {
    const n = normalize(a).trim();
    if (n.length >= 3) seen.add(n);
  }
  return [...seen];
}

/**
 * Best product mentioned in the text, chosen by the longest matching alias
 * (most specific wins). Returns null if nothing matches.
 */
export function matchProduct<T extends ProductLike>(
  text: string,
  products: T[],
): T | null {
  const n = normalize(text);
  let best: { product: T; len: number } | null = null;
  for (const product of products) {
    for (const alias of productAliases(product)) {
      if (n.includes(alias) && (!best || alias.length > best.len)) {
        best = { product, len: alias.length };
      }
    }
  }
  return best?.product ?? null;
}

/** Common English tier/format labels ↔ how Thai customers usually type them, so
 *  a variant named "Premium" still matches a customer who writes "พรีเมียม".
 *  Bidirectional: an English name gains Thai aliases and vice-versa. */
const TIER_TRANSLITERATIONS: [string, string[]][] = [
  ["premium", ["พรีเมียม", "พรีเมี่ยม"]],
  ["standard", ["สแตนดาร์ด", "สแตนดาร์ต", "สแตนดาด"]],
  ["basic", ["เบสิค", "เบสิก"]],
  ["deluxe", ["ดีลักซ์", "ดีลักส์"]],
  ["pdf", ["พีดีเอฟ"]],
  ["ebook", ["อีบุ๊ค", "อีบุ๊ก", "อีบุค"]],
];

/** Match aliases for a variant: full name + SKU, PLUS individual tokens of the
 *  name (so "Premium (รูปเล่ม)" also matches a customer who types just "รูปเล่ม"
 *  or "premium"), PLUS Thai/English transliterations of common tier labels.
 *  Tokens < 3 chars are dropped to avoid spurious hits. */
function variantAliases(v: VariantLike): string[] {
  const seen = new Set<string>();
  const add = (s: string) => {
    const nrm = normalize(s).trim();
    if (nrm.length >= 2) seen.add(nrm);
  };
  for (const a of [v.name, v.sku ?? ""]) add(a);
  // Break the name into words (splitting on spaces, parens, slashes, pipes) so a
  // partial mention still resolves the variant.
  for (const token of (v.name ?? "").split(/[\s()/|,]+/)) {
    if (normalize(token).trim().length >= 3) add(token);
  }
  // Add transliteration equivalents in both directions.
  const nameNrm = normalize(v.name ?? "");
  for (const [en, thais] of TIER_TRANSLITERATIONS) {
    if (nameNrm.includes(en)) thais.forEach(add);
    if (thais.some((t) => nameNrm.includes(t))) add(en);
  }
  return [...seen];
}

function bestVariant(
  n: string,
  variants: VariantLike[],
): { variant: VariantLike; len: number } | null {
  let best: { variant: VariantLike; len: number } | null = null;
  for (const v of variants) {
    for (const alias of variantAliases(v)) {
      if (n.includes(alias) && (!best || alias.length > best.len)) {
        best = { variant: v, len: alias.length };
      }
    }
  }
  return best;
}

export type ProductMatch<T extends ProductLike> = {
  product: T;
  variant?: VariantLike;
};

/**
 * Match a product AND (optionally) a specific variant the customer named.
 * Priority:
 *   1. If the text names a product directly, return it — plus its variant if the
 *      text also names one (e.g. "อีบุ๊กดูดวง แบบ pdf").
 *   2. Otherwise a bare variant label ("pdf", "เล่มปกแข็ง") still resolves — but
 *      ONLY when it points to exactly one product (unambiguous). If two different
 *      products both have a matching variant, we return null and let the AI ask.
 */
export function matchProductOrVariant<T extends ProductLike>(
  text: string,
  products: T[],
): ProductMatch<T> | null {
  const n = normalize(text);

  const product = matchProduct(text, products);
  if (product) {
    const v = bestVariant(n, product.variants ?? []);
    return v ? { product, variant: v.variant } : { product };
  }

  // No product named — try a bare variant alias across the whole catalog.
  const hits: { product: T; variant: VariantLike; len: number }[] = [];
  for (const p of products) {
    const v = bestVariant(n, p.variants ?? []);
    if (v) hits.push({ product: p, variant: v.variant, len: v.len });
  }
  if (hits.length === 0) return null;
  const distinctProducts = new Set(hits.map((h) => h.product.id));
  if (distinctProducts.size > 1) return null; // ambiguous
  hits.sort((a, b) => b.len - a.len);
  return { product: hits[0].product, variant: hits[0].variant };
}
