import type { DbClient } from "@/db/client";
import { confirmPayment, getPaymentAnyTenant } from "@/db/repositories/orders";
import { safeEqual } from "@/lib/crypto";

/**
 * Payment provider callback (Omise/2C2P). A verified callback is the ONLY thing
 * that flips an order to PAID (risk #9) — the AI never confirms payment. Kept
 * provider-agnostic; the real HMAC verification wires in per provider.
 *
 * Expected body: { paymentId, event }  (event "charge.complete" | "paid").
 */
export type PaymentWebhookResult =
  | { ok: false; status: 400 | 401 | 404; error: string }
  | { ok: true; status: 200; orderPaid: boolean; alreadyConfirmed: boolean };

export async function processPaymentWebhook(
  db: DbClient,
  rawBody: string,
  signature: string | null | undefined,
): Promise<PaymentWebhookResult> {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (secret) {
    if (!signature || !safeEqual(signature, secret)) {
      return { ok: false, status: 401, error: "invalid signature" };
    }
  }

  let payload: { paymentId?: string; event?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }
  if (!payload.paymentId) {
    return { ok: false, status: 400, error: "missing paymentId" };
  }

  const payment = await getPaymentAnyTenant(db, payload.paymentId);
  if (!payment) return { ok: false, status: 404, error: "payment not found" };

  // Only settlement events confirm; ignore others (still 200 so the provider
  // doesn't retry).
  if (payload.event !== "charge.complete" && payload.event !== "paid") {
    return { ok: true, status: 200, orderPaid: false, alreadyConfirmed: false };
  }

  // Idempotent: a redelivered callback shouldn't double-process.
  if (payment.status === "CONFIRMED") {
    return { ok: true, status: 200, orderPaid: true, alreadyConfirmed: true };
  }

  const { orderPaid } = await confirmPayment(db, payment.tenantId, payment.id);
  return { ok: true, status: 200, orderPaid, alreadyConfirmed: false };
}
