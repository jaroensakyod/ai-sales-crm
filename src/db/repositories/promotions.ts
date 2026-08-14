import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { promotions } from "@/db/schema";

export async function listPromotions(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.createdAt));
}

/** Active promotions right now (used to make the AI aware of live offers). */
export async function getActivePromotions(
  db: DbClient,
  tenantId: string,
  now: Date = new Date(),
) {
  return db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        eq(promotions.isActive, true),
        or(isNull(promotions.startsAt), lte(promotions.startsAt, now)),
        or(isNull(promotions.endsAt), gte(promotions.endsAt, now)),
      ),
    );
}

export async function createPromotion(
  db: DbClient,
  tenantId: string,
  input: {
    code?: string | null;
    type: (typeof promotions.type.enumValues)[number];
    value: string;
  },
) {
  await db.insert(promotions).values({ tenantId, ...input });
}

export async function togglePromotion(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  await db
    .update(promotions)
    .set({ isActive: sql`NOT ${promotions.isActive}`, updatedAt: new Date() })
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, id)));
}

export async function deletePromotion(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  await db
    .delete(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, id)));
}
