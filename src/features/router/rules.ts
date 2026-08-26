import { and, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { productVariants, products } from "@/db/schema";

import type { ProductLike, VariantLike } from "./intent";

/** Live product read for Level 1 — AI never invents price/stock (docs/02-plan.md).
 *  Variants (e.g. an ebook's PDF vs hardcover) are attached so the checkout flow
 *  can match a version the customer names and price it from the DB. */
export async function loadProducts(
  db: DbClient,
  tenantId: string,
): Promise<ProductLike[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      stock: products.stock,
      currency: products.currency,
      description: products.description,
      aiKnowledge: products.aiKnowledge,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

  if (rows.length === 0) return rows;

  const variantRows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      sku: productVariants.sku,
      price: productVariants.price,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        inArray(
          productVariants.productId,
          rows.map((r) => r.id),
        ),
      ),
    );

  const byProduct = new Map<string, VariantLike[]>();
  for (const v of variantRows) {
    const list = byProduct.get(v.productId) ?? [];
    list.push({ id: v.id, name: v.name, sku: v.sku, price: v.price });
    byProduct.set(v.productId, list);
  }

  return rows.map((r) => ({ ...r, variants: byProduct.get(r.id) ?? [] }));
}

function formatPrice(price: string, currency: string): string {
  const n = Number(price);
  const amount = Number.isFinite(n) ? n.toLocaleString("th-TH") : price;
  return currency === "THB" ? `${amount} บาท` : `${amount} ${currency}`;
}

export function priceAnswer(p: ProductLike): string {
  return `${p.name} ราคา ${formatPrice(p.price, p.currency)}ค่ะ`;
}

export function stockAnswer(p: ProductLike): string {
  if (p.stock === null) return `${p.name} มีจำหน่ายค่ะ`;
  if (p.stock <= 0) return `ขออภัยค่ะ ${p.name} หมดสต็อกชั่วคราว`;
  return `${p.name} พร้อมส่งค่ะ (คงเหลือ ${p.stock} ชิ้น)`;
}
