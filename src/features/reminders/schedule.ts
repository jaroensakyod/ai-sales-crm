import type { DbClient } from "@/db/client";
import { scheduleFollowup } from "@/db/repositories/followups";

/** Remind this long before the appointment / stay. */
export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Queue a reminder before an appointment or hotel stay. It's a TRANSACTIONAL
 * follow-up, so the existing engine pushes it at the scheduled time (and it's
 * exempt from the promotional 24h-window gate). Skips silently when the event is
 * already within the lead window — someone who books for later today doesn't
 * need a day-before reminder.
 */
export async function scheduleReminder(
  db: DbClient,
  args: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    channelId: string;
    at: Date;
    text: string;
    now?: Date;
  },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const remindAt = new Date(args.at.getTime() - REMINDER_LEAD_MS);
  if (remindAt.getTime() <= now.getTime()) return false;
  await scheduleFollowup(db, args.tenantId, {
    customerId: args.customerId,
    conversationId: args.conversationId,
    channelId: args.channelId,
    category: "TRANSACTIONAL",
    scheduledAt: remindAt,
    payload: { text: args.text },
    reason: "reminder",
  });
  return true;
}
