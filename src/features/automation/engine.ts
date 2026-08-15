import type { DbClient } from "@/db/client";
import { listActiveRulesByTrigger } from "@/db/repositories/automation";
import { scheduleFollowup } from "@/db/repositories/followups";

import type { Action, TriggerType } from "./types";

export type AutomationContext = {
  customerId: string;
  conversationId?: string;
  channelId?: string;
};

/**
 * Run all active rules for a trigger. Each SCHEDULE_FOLLOWUP action queues a
 * follow-up (which the Follow-up Engine later sends, subject to the 24h-window
 * gate). Best-effort: a failing rule doesn't block the others or the caller.
 */
export async function runAutomations(
  db: DbClient,
  tenantId: string,
  triggerType: TriggerType,
  ctx: AutomationContext,
  now: Date = new Date(),
): Promise<number> {
  const rules = await listActiveRulesByTrigger(db, tenantId, triggerType);
  let queued = 0;

  for (const rule of rules) {
    try {
      const action = rule.action as Action;
      if (action.type === "SCHEDULE_FOLLOWUP") {
        const scheduledAt = new Date(
          now.getTime() + action.delayHours * 60 * 60 * 1000,
        );
        await scheduleFollowup(db, tenantId, {
          customerId: ctx.customerId,
          conversationId: ctx.conversationId,
          channelId: ctx.channelId,
          category: action.category,
          scheduledAt,
          payload: { text: action.message },
          reason: `automation:${rule.id}`,
        });
        queued++;
      }
    } catch (err) {
      console.error("automation rule failed:", rule.id, err);
    }
  }
  return queued;
}
