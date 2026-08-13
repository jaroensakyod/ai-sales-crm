import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customers } from "@/db/schema";

/**
 * Every function here takes tenantId as the first scoping argument and folds it
 * into the WHERE/VALUES. There is no "get by id" without a tenant — that is the
 * whole point (risk #8): a caller holding another tenant's row id still gets
 * nothing back.
 */

export type NewCustomer = {
  displayName?: string;
  phone?: string;
  email?: string;
};

export async function createCustomer(
  db: DbClient,
  tenantId: string,
  input: NewCustomer,
) {
  const [row] = await db
    .insert(customers)
    .values({ ...input, tenantId })
    .returning();
  return row;
}

export async function listCustomers(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(desc(customers.createdAt));
}

/** Returns null unless the row belongs to THIS tenant. */
export async function getCustomer(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
  return row ?? null;
}

/** PDPA profiling opt-in (risk #3) — separate from general T&C. */
export async function setProfilingConsent(
  db: DbClient,
  tenantId: string,
  id: string,
  consent: boolean,
) {
  const [row] = await db
    .update(customers)
    .set({
      profilingConsent: consent,
      profilingConsentAt: consent ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)))
    .returning();
  return row ?? null;
}
