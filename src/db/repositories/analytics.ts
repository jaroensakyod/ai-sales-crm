import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  aiRuns,
  channels,
  conversations,
  customers,
  leads,
  messages,
  objections,
  orders,
} from "@/db/schema";

export type TenantOverview = {
  conversations: { total: number; open: number; handoff: number };
  orders: { total: number; paid: number; pending: number; revenue: number };
  leads: { total: number };
  ai: { calls: number; costUsd: number; byLevel: Record<number, number> };
};

export type BotImpact = {
  /** Orders that came from a chat (orders.conversationId set) vs keyed in by hand. */
  chatOrders: number;
  chatPaid: number;
  chatRevenue: number;
  manualOrders: number;
  /** Total conversations and how many turned into at least one order. */
  conversations: number;
  convertedConversations: number;
  /** Paid chat orders created outside 09:00–18:00 (Asia/Bangkok) — sales the bot
   *  captured while the shop was likely closed. */
  afterHoursPaid: number;
  afterHoursRevenue: number;
};

/**
 * Honest "what the bot did" numbers. Everything is bot-ATTRIBUTED (orders that
 * originated from a chat), not a true with-vs-without A/B — there's no baseline
 * cohort. Profit isn't here because products have no cost field yet.
 */
export async function getBotImpact(
  db: DbClient,
  tenantId: string,
): Promise<BotImpact> {
  const fromChat = sql`${orders.conversationId} is not null`;
  const paidChat = sql`${orders.conversationId} is not null and ${orders.status} = 'PAID'`;
  const afterHours = sql`${paidChat} and extract(hour from ${orders.createdAt} at time zone 'Asia/Bangkok') not between 9 and 17`;

  const [o] = await db
    .select({
      chatOrders: sql<number>`(count(*) filter (where ${fromChat}))::int`,
      chatPaid: sql<number>`(count(*) filter (where ${paidChat}))::int`,
      chatRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${paidChat}), 0)::float`,
      manualOrders: sql<number>`(count(*) filter (where ${orders.conversationId} is null))::int`,
      afterHoursPaid: sql<number>`(count(*) filter (where ${afterHours}))::int`,
      afterHoursRevenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${afterHours}), 0)::float`,
    })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));

  const [c] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId));

  const [cc] = await db
    .select({
      converted: sql<number>`count(distinct ${orders.conversationId})::int`,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), fromChat));

  return {
    chatOrders: o.chatOrders,
    chatPaid: o.chatPaid,
    chatRevenue: o.chatRevenue,
    manualOrders: o.manualOrders,
    conversations: c.total,
    convertedConversations: cc.converted,
    afterHoursPaid: o.afterHoursPaid,
    afterHoursRevenue: o.afterHoursRevenue,
  };
}

export async function getTenantOverview(
  db: DbClient,
  tenantId: string,
): Promise<TenantOverview> {
  const [conv] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`(count(*) filter (where ${conversations.status} = 'OPEN'))::int`,
      handoff: sql<number>`(count(*) filter (where ${conversations.status} = 'HANDOFF'))::int`,
    })
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId));

  const [ord] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`(count(*) filter (where ${orders.status} = 'PAID'))::int`,
      pending: sql<number>`(count(*) filter (where ${orders.status} = 'PENDING_PAYMENT'))::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'PAID'), 0)::float`,
    })
    .from(orders)
    .where(eq(orders.tenantId, tenantId));

  const [lead] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.tenantId, tenantId));

  const [ai] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      costUsd: sql<number>`coalesce(sum(${aiRuns.costUsd}), 0)::float`,
    })
    .from(aiRuns)
    .where(eq(aiRuns.tenantId, tenantId));

  const levels = await db
    .select({
      level: aiRuns.routerLevel,
      calls: sql<number>`count(*)::int`,
    })
    .from(aiRuns)
    .where(eq(aiRuns.tenantId, tenantId))
    .groupBy(aiRuns.routerLevel);

  const byLevel: Record<number, number> = {};
  for (const l of levels) if (l.level != null) byLevel[l.level] = l.calls;

  return {
    conversations: conv,
    orders: ord,
    leads: lead,
    ai: { calls: ai.calls, costUsd: ai.costUsd, byLevel },
  };
}

export async function listRecentConversations(
  db: DbClient,
  tenantId: string,
  limit = 20,
) {
  return db
    .select({
      id: conversations.id,
      status: conversations.status,
      lastInboundAt: conversations.lastInboundAt,
      updatedAt: conversations.updatedAt,
      customerName: customers.displayName,
      channelType: channels.type,
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .leftJoin(channels, eq(channels.id, conversations.channelId))
    .where(eq(conversations.tenantId, tenantId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

export async function getConversationThread(
  db: DbClient,
  tenantId: string,
  conversationId: string,
) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.id, conversationId),
      ),
    );
  if (!conversation) return null;

  const thread = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(asc(messages.createdAt));

  return { conversation, messages: thread };
}

/** Objection breakdown by type (Objection Engine analytics — Pro, docs/01). */
export async function getObjectionBreakdown(db: DbClient, tenantId: string) {
  return db
    .select({
      type: objections.type,
      total: sql<number>`count(*)::int`,
      open: sql<number>`(count(*) filter (where ${objections.resolved} = false))::int`,
    })
    .from(objections)
    .where(eq(objections.tenantId, tenantId))
    .groupBy(objections.type)
    .orderBy(desc(sql`count(*)`));
}

export async function getLeadScoreStats(db: DbClient, tenantId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      avgScore: sql<number>`coalesce(round(avg(${leads.score})), 0)::int`,
      hot: sql<number>`(count(*) filter (where ${leads.score} >= 60))::int`,
    })
    .from(leads)
    .where(eq(leads.tenantId, tenantId));
  return row ?? { count: 0, avgScore: 0, hot: 0 };
}

export async function listRecentOrders(
  db: DbClient,
  tenantId: string,
  limit = 10,
) {
  return db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.total,
      currency: orders.currency,
      createdAt: orders.createdAt,
      customerName: customers.displayName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
