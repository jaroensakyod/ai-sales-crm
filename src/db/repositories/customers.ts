import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customerIdentities, customers } from "@/db/schema";

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

/**
 * Find-or-create the customer behind a channel identity (channelId + externalId,
 * e.g. LINE userId). Race-safe: the unique index on customer_identities means a
 * concurrent insert loses the transaction (rolling back its orphan customer) and
 * we re-read the winner's identity.
 */
export async function resolveCustomerByIdentity(
  db: DbClient,
  tenantId: string,
  channelId: string,
  externalId: string,
  profile?: { displayName?: string; avatarUrl?: string },
): Promise<{ customerId: string; identityId: string; created: boolean }> {
  const found = await selectIdentity(db, tenantId, channelId, externalId);
  if (found) {
    return { customerId: found.customerId, identityId: found.id, created: false };
  }

  try {
    return await db.transaction(async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({ tenantId, displayName: profile?.displayName })
        .returning();
      const [identity] = await tx
        .insert(customerIdentities)
        .values({
          tenantId,
          customerId: customer.id,
          channelId,
          externalId,
          displayName: profile?.displayName,
          avatarUrl: profile?.avatarUrl,
        })
        .returning();
      return { customerId: customer.id, identityId: identity.id, created: true };
    });
  } catch (err) {
    // 23505 = unique_violation: a concurrent request created it first.
    if ((err as { code?: string }).code === "23505") {
      const winner = await selectIdentity(db, tenantId, channelId, externalId);
      if (winner) {
        return { customerId: winner.customerId, identityId: winner.id, created: false };
      }
    }
    throw err;
  }
}

async function selectIdentity(
  db: DbClient,
  tenantId: string,
  channelId: string,
  externalId: string,
) {
  const [row] = await db
    .select()
    .from(customerIdentities)
    .where(
      and(
        eq(customerIdentities.tenantId, tenantId),
        eq(customerIdentities.channelId, channelId),
        eq(customerIdentities.externalId, externalId),
      ),
    );
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
