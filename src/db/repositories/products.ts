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
    aiKnowledge?: string | null;
    imageUrl?: string | null;
    isDigital?: boolean;
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
    aiKnowledge?: string | null;
    imageUrl?: string | null;
    isDigital?: boolean;
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

export async function listVariants(
  db: DbClient,
  tenantId: string,
  productId: string,
) {
  return db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.tenantId, tenantId),
        eq(productVariants.productId, productId),
      ),
    );
}

export async function addVariant(
  db: DbClient,
  tenantId: string,
  productId: string,
  input: {
    name: string;
    price?: string | null;
    stock?: number | null;
    isDigital?: boolean;
  },
) {
  await db
    .insert(productVariants)
    .values({ tenantId, productId, ...input });
}

export async function deleteVariant(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(productVariants)
    .where(
      and(eq(productVariants.tenantId, tenantId), eq(productVariants.id, id)),
    );
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

/** Cross-sell rows for management UI (includes the join row id for removal). */
export async function listCrossSells(
  db: DbClient,
  tenantId: string,
  productId: string,
) {
  return db
    .select({
      id: crossSells.id,
      suggestedProductId: crossSells.suggestedProductId,
      name: products.name,
      reason: crossSells.reason,
    })
    .from(crossSells)
    .innerJoin(products, eq(products.id, crossSells.suggestedProductId))
    .where(
      and(
        eq(crossSells.tenantId, tenantId),
        eq(crossSells.productId, productId),
      ),
    )
    .orderBy(desc(crossSells.weight));
}

export async function addCrossSell(
  db: DbClient,
  tenantId: string,
  productId: string,
  suggestedProductId: string,
  reason?: string | null,
) {
  if (productId === suggestedProductId) return; // no self-pairing
  await db
    .insert(crossSells)
    .values({ tenantId, productId, suggestedProductId, reason, weight: 10 })
    .onConflictDoNothing({
      target: [
        crossSells.tenantId,
        crossSells.productId,
        crossSells.suggestedProductId,
      ],
    });
}

export async function removeCrossSell(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  await db
    .delete(crossSells)
    .where(and(eq(crossSells.tenantId, tenantId), eq(crossSells.id, id)));
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
