import { and, asc, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { crossSells, productVariants, products } from "@/db/schema";

export async function listProducts(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(products)
    .where(eq(products.tenantId, tenantId))
    .orderBy(asc(products.name));
}

export async function createProduct(
  db: DbClient,
  tenantId: string,
  input: {
    name: string;
    price: string;
    stock?: number | null;
    sku?: string | null;
    description?: string | null;
  },
) {
  const [row] = await db
    .insert(products)
    .values({ tenantId, ...input, currency: "THB" })
    .returning();
  return row;
}

export async function updateProduct(
  db: DbClient,
  tenantId: string,
  id: string,
  input: {
    name?: string;
    price?: string;
    stock?: number | null;
    sku?: string | null;
    description?: string | null;
    isActive?: boolean;
  },
) {
  await db
    .update(products)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
}

export async function deleteProduct(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
}

export async function getProduct(db: DbClient, tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.id, id)));
  return row ?? null;
}

export async function getVariant(db: DbClient, tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(productVariants)
    .where(
      and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, id)),
    );
  return row ?? null;
}

/** Curated cross-sell suggestions for a product (not AI guesses — docs/01). */
export async function suggestCrossSells(
  db: DbClient,
  tenantId: string,
  productId: string,
) {
  return db
    .select({
      productId: crossSells.suggestedProductId,
      name: products.name,
      price: products.price,
      currency: products.currency,
      reason: crossSells.reason,
      weight: crossSells.weight,
    })
    .from(crossSells)
    .innerJoin(products, eq(products.id, crossSells.suggestedProductId))
    .where(
      and(
        eq(crossSells.tenantId, tenantId),
        eq(crossSells.productId, productId),
        eq(products.isActive, true),
      ),
    )
    .orderBy(desc(crossSells.weight));
}
