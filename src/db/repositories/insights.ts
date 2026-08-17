import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customers, messages, orderItems, orders } from "@/db/schema";

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

/** Best-selling products by units sold, across paid/fulfilled orders. Groups by
 *  the name snapshot so it still works for products edited or deleted later. */
export async function bestSellers(
  db: DbClient,
  tenantId: string,
  limit = 5,
): Promise<{ name: string; qty: number; revenue: number }[]> {
  return db
    .select({
      name: orderItems.nameSnapshot,
      qty: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`sum(${orderItems.quantity} * ${orderItems.unitPrice})::float`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.tenantId, tenantId),
        inArray(orders.status, ["PAID", "FULFILLED"]),
      ),
    )
    .groupBy(orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);
}

/** Inbound-message volume by hour of day (Bangkok time), 0–23. Fills missing
 *  hours with 0 so the caller can render a full 24-bar chart. */
export async function peakHours(
  db: DbClient,
  tenantId: string,
): Promise<{ hour: number; count: number }[]> {
  const rows = await db
    .select({
      hour: sql<number>`extract(hour from ${messages.sentAt} at time zone 'Asia/Bangkok')::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(
      and(eq(messages.tenantId, tenantId), eq(messages.direction, "INBOUND")),
    )
    .groupBy(sql`1`);

  const byHour = new Map(rows.map((r) => [r.hour, r.count]));
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: byHour.get(h) ?? 0,
  }));
}
