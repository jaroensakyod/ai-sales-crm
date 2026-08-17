import type { DbClient } from "@/db/client";
import {
  getDueDeliveries,
  markDeliveryRetry,
  markDeliverySent,
} from "@/db/repositories/webhooks";

import { computeWebhookSignature } from "./sign";

export type WebhookRunResult = {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
};

/** Retry backoff by attempt number (minutes): 1m, 5m, 30m, then give up. */
const BACKOFF_MIN = [1, 5, 30];
const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;
const TIMEOUT_MS = 10_000;

type FetchFn = typeof fetch;

/**
 * POST every due delivery to its endpoint with a signed body, then mark it
 * SENT, or schedule a retry / give up. `fetchImpl` and `now` are injectable so
 * tests never hit the network. A non-2xx or a network error is a failed attempt.
 */
export async function processDueWebhooks(
  db: DbClient,
  deps: { now?: Date; fetchImpl?: FetchFn; limit?: number } = {},
): Promise<WebhookRunResult> {
  const now = deps.now ?? new Date();
  const doFetch = deps.fetchImpl ?? fetch;
  const due = await getDueDeliveries(db, now, deps.limit ?? 50);

  const result: WebhookRunResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    retried: 0,
  };

  for (const { delivery, url, secret } of due) {
    result.processed++;
    const body = JSON.stringify(delivery.payload);
    const signature = computeWebhookSignature(secret, body);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-webhook-signature": signature,
            "x-webhook-event": delivery.event,
          },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        await markDeliverySent(db, delivery.id, res.status, now);
        result.sent++;
      } else {
        await scheduleRetryOrFail(
          db,
          delivery.id,
          delivery.attempts,
          { responseStatus: res.status, error: `HTTP ${res.status}` },
          now,
          result,
        );
      }
    } catch (err) {
      await scheduleRetryOrFail(
        db,
        delivery.id,
        delivery.attempts,
        { error: err instanceof Error ? err.message : String(err) },
        now,
        result,
      );
    }
  }

  return result;
}

async function scheduleRetryOrFail(
  db: DbClient,
  id: string,
  attempts: number,
  info: { responseStatus?: number; error: string },
  now: Date,
  result: WebhookRunResult,
): Promise<void> {
  const nextAttemptNo = attempts + 1; // attempt we just used
  const backoff = BACKOFF_MIN[nextAttemptNo - 1];
  const willRetry = nextAttemptNo < MAX_ATTEMPTS && backoff != null;
  const nextAttemptAt = willRetry
    ? new Date(now.getTime() + backoff * 60_000)
    : null;
  await markDeliveryRetry(
    db,
    id,
    attempts,
    { responseStatus: info.responseStatus, error: info.error, nextAttemptAt },
    now,
  );
  if (willRetry) result.retried++;
  else result.failed++;
}
