import { and, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  addLeadEvent,
  ensureLead,
  recordObjection,
  setLeadScore,
} from "@/db/repositories/leads";
import {
  conversations,
  messages,
  objections,
  orders,
} from "@/db/schema";

import { detectObjection } from "./objection";
import { computeLeadScore, type LeadSignals } from "./scoring";

/** Gather scoring signals for a customer/lead from live data. */
export async function getLeadSignals(
  db: DbClient,
  tenantId: string,
  customerId: string,
  leadId: string,
): Promise<LeadSignals> {
  const [msg] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(conversations.customerId, customerId),
        eq(messages.direction, "INBOUND"),
      ),
    );

  const [ord] = await db
    .select({
      total: sql<number>`count(*)::int`,
      paid: sql<number>`(count(*) filter (where ${orders.status} = 'PAID'))::int`,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.customerId, customerId)));

  const [obj] = await db
    .select({ open: sql<number>`(count(*) filter (where ${objections.resolved} = false))::int` })
    .from(objections)
    .where(and(eq(objections.tenantId, tenantId), eq(objections.leadId, leadId)));

  return {
    messageCount: msg?.count ?? 0,
    hasOrder: (ord?.total ?? 0) > 0,
    paidOrder: (ord?.paid ?? 0) > 0,
    openObjections: obj?.open ?? 0,
  };
}

/**
 * CRM side-effects for one inbound message: ensure a lead exists, log the touch,
 * classify + record any objection, and recompute the lead score. Runs on every
 * inbound so the pipeline stays current without manual data entry.
 */
export async function syncLeadOnInbound(
  db: DbClient,
  args: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    text: string;
  },
): Promise<{ leadId: string; score: number; objection: string | null }> {
  const lead = await ensureLead(db, args.tenantId, {
    customerId: args.customerId,
    conversationId: args.conversationId,
  });
  await addLeadEvent(db, args.tenantId, lead.id, "inbound_message");

  const objectionType = detectObjection(args.text);
  if (objectionType) {
    await recordObjection(db, args.tenantId, {
      leadId: lead.id,
      conversationId: args.conversationId,
      type: objectionType,
      detail: args.text.slice(0, 300),
    });
  }

  const signals = await getLeadSignals(db, args.tenantId, args.customerId, lead.id);
  const score = computeLeadScore(signals);
  await setLeadScore(db, args.tenantId, lead.id, score);

  return { leadId: lead.id, score, objection: objectionType };
}
