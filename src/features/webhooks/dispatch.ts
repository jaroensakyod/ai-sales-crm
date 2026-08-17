import type { DbClient } from "@/db/client";
import {
  endpointsForEvent,
  enqueueDelivery,
  type WebhookEvent,
} from "@/db/repositories/webhooks";

/**
 * Enqueue an event for delivery to every active endpoint subscribed to it.
 * Fast (DB inserts only) so it never blocks the chat/checkout path — the actual
 * HTTP POST happens later in the /api/cron/webhooks processor. Best-effort:
 * errors are swallowed so a webhook problem can never break a sale.
 */
export async function enqueueWebhookEvent(
  db: DbClient,
  tenantId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await endpointsForEvent(db, tenantId, event);
    if (endpoints.length === 0) return;
    const payload = { event, data, tenantId };
    for (const ep of endpoints) {
      await enqueueDelivery(db, tenantId, {
        endpointId: ep.id,
        event,
        payload,
      });
    }
  } catch {
    // Never let webhook bookkeeping break the caller.
  }
}
