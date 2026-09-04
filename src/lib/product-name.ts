/** Customer-facing name for a product + chosen variant, without the duplication
 *  we shipped before ("Standard (Standard (PDF))" — the variant's own name already
 *  repeated the product/tier). If either name already contains the other, keep the
 *  more specific one instead of nesting them. Used by both the checkout card text
 *  and the immutable order-item name snapshot so the two never disagree. */
export function formatVariantDisplayName(
  productName: string,
  variantName?: string | null,
): string {
  const p = productName.trim();
  const v = variantName?.trim();
  if (!v) return p;
  const pl = p.toLowerCase();
  const vl = v.toLowerCase();
  if (vl.includes(pl)) return v; // variant already names the product/tier
  if (pl.includes(vl)) return p; // product name already covers the variant
  return `${p} (${v})`;
}
