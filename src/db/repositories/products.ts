import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { crossSells, productVariants, products } from "@/db/schema";

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
