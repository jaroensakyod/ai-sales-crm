import { and, desc, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { automationRules } from "@/db/schema";
import type { Action, Trigger, TriggerType } from "@/features/automation/types";

export async function listRules(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenantId))
    .orderBy(desc(automationRules.createdAt));
}

/** Active rules whose trigger matches, for the engine. */
export async function listActiveRulesByTrigger(
  db: DbClient,
  tenantId: string,
  triggerType: TriggerType,
) {
  return db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.tenantId, tenantId),
        eq(automationRules.isActive, true),
        sql`${automationRules.trigger}->>'type' = ${triggerType}`,
      ),
    );
}

export async function createRule(
  db: DbClient,
  tenantId: string,
  input: { name: string; trigger: Trigger; action: Action },
) {
  await db.insert(automationRules).values({
    tenantId,
    name: input.name,
    trigger: input.trigger,
    action: input.action,
  });
}

export async function toggleRule(db: DbClient, tenantId: string, id: string) {
  await db
    .update(automationRules)
    .set({ isActive: sql`NOT ${automationRules.isActive}`, updatedAt: new Date() })
    .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, id)));
}

export async function deleteRule(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(automationRules)
    .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, id)));
}
