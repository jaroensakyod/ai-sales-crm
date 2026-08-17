import type { DbClient } from "@/db/client";
import {
  addOrderItem,
  createOrder,
  getOpenOrderForConversation,
  getOrder,
  updateOrderStatus,
} from "@/db/repositories/orders";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { runAutomations } from "@/features/automation/engine";
import { scheduleCartRecovery } from "@/features/reminders/order-events";
import { enqueueWebhookEvent } from "@/features/webhooks/dispatch";
import { matchHandoff, matchProduct } from "@/features/router/intent";
import { loadProducts } from "@/features/router/rules";
import { buildPaymentInstruction } from "@/features/payment/instruction";

import { hasBuyIntent, parseQuantity } from "./order-intent";

export type CheckoutResult = { orderId: string; reply: string } | null;

/**
 * Rule-based checkout: if the customer clearly wants to buy a specific product,
 * create the order (DB prices only — the AI never sets a price, risk #5), mark
 * it awaiting payment, and return the summary + "แจ้งโอน" message. Payment is
 * NOT confirmed here — only a verified slip/callback flips it to PAID (risk #9).
 * Returns null when there's no clear buy intent or no product match.
 */
export async function tryCheckout(
  db: DbClient,
  ctx: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    channelId?: string;
    text: string;
  },
): Promise<CheckoutResult> {
  // Cancel/refund/dispute messages ("ยกเลิกคำสั่งซื้อ") contain buy words but
  // must go to a human, never create an order.
  if (matchHandoff(ctx.text)) return null;
  if (!hasBuyIntent(ctx.text)) return null;

  const product = matchProduct(ctx.text, await loadProducts(db, ctx.tenantId));
  if (!product) return null;

  // Idempotency: if this conversation already has an unpaid order, re-send its
  // instruction instead of creating a duplicate (guards repeated buy messages
  // and webhook redelivery).
  const existing = await getOpenOrderForConversation(
    db,
    ctx.tenantId,
    ctx.conversationId,
  );
  const paySettings = await getPaymentSettings(db, ctx.tenantId);

  if (existing) {
    const total = Number(existing.total);
    return {
      orderId: existing.id,
      reply:
        `ออเดอร์เดิมของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
        buildPaymentInstruction(paySettings, { total }),
    };
  }

  const quantity = parseQuantity(ctx.text);
  const order = await createOrder(db, ctx.tenantId, {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
  });
  await addOrderItem(db, ctx.tenantId, order.id, {
    productId: product.id,
    quantity,
  });
  await updateOrderStatus(db, ctx.tenantId, order.id, "PENDING_PAYMENT");

  const detail = await getOrder(db, ctx.tenantId, order.id);
  const total = Number(detail?.order.total ?? 0);

  await runAutomations(db, ctx.tenantId, "ORDER_CREATED", {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    channelId: ctx.channelId,
  });

  // Nudge if the order is still unpaid a few hours from now. Cancelled
  // automatically by the engine's status guard once they pay.
  if (ctx.channelId) {
    await scheduleCartRecovery(db, {
      tenantId: ctx.tenantId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      channelId: ctx.channelId,
      orderId: order.id,
      total,
    });
  }

  await enqueueWebhookEvent(db, ctx.tenantId, "order.created", {
    orderId: order.id,
    total,
    quantity,
    productId: product.id,
    productName: product.name,
    customerId: ctx.customerId,
  });

  const reply =
    `รับ ${product.name} จำนวน ${quantity} ชิ้น ` +
    `รวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
    buildPaymentInstruction(paySettings, { total });

  return { orderId: order.id, reply };
}
