import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customers, messages, orders } from "@/db/schema";

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type CustomerInsights = {
  totalCustomers: number;
  newThisMonth: number;
  consentCount: number;
  messagesThisMonth: number;
  topCustomers: { id: string; name: string | null; spent: number; orders: number }[];
};

/** Customer-facing analytics for a tenant: how many customers, how many are new,
 *  who spends the most, and this month's inbound volume. */
export async function customerInsights(
  db: DbClient,
  tenantId: string,
): Promise<CustomerInsights> {
  const monthStart = monthStartUtc();
  const monthStartIso = monthStart.toISOString();

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      newThis: sql<number>`count(*) filter (where ${customers.createdAt} >= ${monthStartIso})::int`,
      consent: sql<number>`count(*) filter (where ${customers.profilingConsent})::int`,
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));

  const [msgs] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.direction, "INBOUND"),
        gte(messages.sentAt, monthStart),
      ),
    );

  const topCustomers = await db
    .select({
      id: customers.id,
      name: customers.displayName,
      spent: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
      orders: sql<number>`count(${orders.id})::int`,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        inArray(orders.status, ["PAID", "FULFILLED"]),
      ),
    )
    .groupBy(customers.id, customers.displayName)
    .orderBy(desc(sql`sum(${orders.total})`))
    .limit(5);

  return {
    totalCustomers: counts?.total ?? 0,
    newThisMonth: counts?.newThis ?? 0,
    consentCount: counts?.consent ?? 0,
    messagesThisMonth: msgs?.n ?? 0,
    topCustomers,
  };
}
