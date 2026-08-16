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

export type ProductLike = {
  id: string;
  name: string;
  sku: string | null;
  price: string;
  stock: number | null;
  currency: string;
  description?: string | null;
  imageUrl?: string | null;
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
