import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { products } from "@/db/schema";

import type { ProductLike } from "./intent";

/** Live product read for Level 1 — AI never invents price/stock (docs/02-plan.md). */
export async function loadProducts(
  db: DbClient,
  tenantId: string,
): Promise<ProductLike[]> {
  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      price: products.price,
      stock: products.stock,
      currency: products.currency,
      description: products.description,
    })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));
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
