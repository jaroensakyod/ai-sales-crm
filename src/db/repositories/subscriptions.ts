import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { channels, subscriptions } from "@/db/schema";

export async function getSubscription(db: DbClient, tenantId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId));
  return row ?? null;
}

/** Set (create or change) the tenant's plan. Real payment wires in later. */
export async function setPlan(
  db: DbClient,
  tenantId: string,
  plan: (typeof subscriptions.plan.enumValues)[number],
  opts: {
    status?: (typeof subscriptions.status.enumValues)[number];
    provider?: string;
    providerRef?: string;
  } = {},
) {
  const status = opts.status ?? (plan === "FREE" ? "TRIALING" : "ACTIVE");
  const [row] = await db
    .insert(subscriptions)
    .values({ tenantId, plan, status, provider: opts.provider, providerRef: opts.providerRef })
    .onConflictDoUpdate({
      target: subscriptions.tenantId,
      set: {
        plan,
        status,
        provider: opts.provider,
        providerRef: opts.providerRef,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function countChannels(db: DbClient, tenantId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(channels)
    .where(eq(channels.tenantId, tenantId));
  return row?.count ?? 0;
}
