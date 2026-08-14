import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { leadEvents, leads, objections } from "@/db/schema";

/** Find the customer's existing lead or create one (one active lead per customer). */
export async function ensureLead(
  db: DbClient,
  tenantId: string,
  input: { customerId: string; conversationId?: string; stageId?: string },
) {
  const [existing] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.customerId, input.customerId)))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(leads)
    .values({
      tenantId,
      customerId: input.customerId,
      conversationId: input.conversationId,
      stageId: input.stageId,
    })
    .returning();
  await addLeadEvent(db, tenantId, row.id, "created");
  return row;
}

export async function addLeadEvent(
  db: DbClient,
  tenantId: string,
  leadId: string,
  type: string,
  data?: unknown,
) {
  const [row] = await db
    .insert(leadEvents)
    .values({ tenantId, leadId, type, data })
    .returning();
  return row;
}

export async function moveLeadStage(
  db: DbClient,
  tenantId: string,
  leadId: string,
  stageId: string,
) {
  await db
    .update(leads)
    .set({ stageId, updatedAt: new Date() })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
  await addLeadEvent(db, tenantId, leadId, "stage_change", { stageId });
}

export async function setLeadScore(
  db: DbClient,
  tenantId: string,
  leadId: string,
  score: number,
) {
  await db
    .update(leads)
    .set({ score, updatedAt: new Date() })
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
}

/** Log a classified objection (Objection Engine — docs/01 differentiator). */
export async function recordObjection(
  db: DbClient,
  tenantId: string,
  input: {
    type: (typeof objections.type.enumValues)[number];
    leadId?: string;
    conversationId?: string;
    detail?: string;
  },
) {
  const [row] = await db
    .insert(objections)
    .values({ tenantId, ...input })
    .returning();
  if (input.leadId) {
    await addLeadEvent(db, tenantId, input.leadId, "objection", {
      type: input.type,
    });
  }
  return row;
}
