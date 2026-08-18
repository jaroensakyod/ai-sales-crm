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
import { matchHandoff, matchProductOrVariant } from "@/features/router/intent";
import { loadProducts } from "@/features/router/rules";
import { buildPaymentInstruction } from "@/features/payment/instruction";

import {
  hasBuyIntent,
  hasConfirmIntent,
  looksLikeQuestion,
  parseQuantity,
} from "./order-intent";

export type CheckoutResult = {
  orderId: string;
  reply: string;
  /** True when we've drafted an order and are waiting for the customer to tap
   *  "ยืนยันสั่งซื้อ". The pipeline attaches the confirm chip in this case and does
   *  NOT reveal the bank account yet (account is only sent on confirm). */
  awaitingConfirm?: boolean;
} | null;

function draftSummaryReply(productName: string, quantity: number, total: number) {
  return (
    `รับ ${productName} จำนวน ${quantity} ชิ้น ` +
    `รวม ${total.toLocaleString("th-TH")} บาทค่ะ\n\n` +
    `ยืนยันสั่งซื้อไหมคะ? กดปุ่ม "ยืนยันสั่งซื้อ" ด้านล่างเพื่อรับข้อมูลการโอนได้เลยค่ะ 😊`
  );
}

/**
 * Step 1 of checkout: a clear "buy this product" message creates a DRAFT order
 * (DB prices only — the AI never sets a price, risk #5) and asks the customer to
 * confirm. We do NOT send the bank account here — that only happens after the
 * customer confirms (tryConfirmOrder), so the bot never volunteers account
 * details on a half-formed intent. Returns null when there's no clear buy intent
 * or no product match.
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

  const match = matchProductOrVariant(ctx.text, await loadProducts(db, ctx.tenantId));

  // Buy signal: an explicit buy verb, OR the customer naming a specific version
  // (variant) of a product — "pdf" / "เล่มปกแข็ง" — as long as it's not a question
  // ("แบบ pdf มีไหม"). Picking a version is itself a decision to buy that version.
  const picksVariant = !!match?.variant && !looksLikeQuestion(ctx.text);
  if (!hasBuyIntent(ctx.text) && !picksVariant) return null;

  const product = match?.product;
  if (!product) return null;
  const variant = match.variant;

  // Idempotency: if this conversation already has an unpaid order, don't create a
  // duplicate. A PENDING_PAYMENT order (already confirmed) re-sends its payment
  // instruction; a DRAFT order re-asks for confirmation.
  const existing = await getOpenOrderForConversation(
    db,
    ctx.tenantId,
    ctx.conversationId,
  );

  if (existing) {
    const total = Number(existing.total);
    if (existing.status === "PENDING_PAYMENT") {
      const paySettings = await getPaymentSettings(db, ctx.tenantId);
      return {
        orderId: existing.id,
        reply:
          `ออเดอร์เดิมของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
          buildPaymentInstruction(paySettings, { total }),
      };
    }
    // DRAFT awaiting confirmation → re-ask.
    return {
      orderId: existing.id,
      reply:
        `ออเดอร์ของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ\n\n` +
        `ยืนยันสั่งซื้อไหมคะ? กดปุ่ม "ยืนยันสั่งซื้อ" ด้านล่างเพื่อรับข้อมูลการโอนได้เลยค่ะ 😊`,
      awaitingConfirm: true,
    };
  }

  const quantity = parseQuantity(ctx.text);
  const order = await createOrder(db, ctx.tenantId, {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
  });
  // Price is read from the DB by addOrderItem — for a variant we pass variantId
  // so its own price applies (AI never sets a price — risk #5).
  await addOrderItem(db, ctx.tenantId, order.id, {
    productId: variant ? undefined : product.id,
    variantId: variant?.id,
    quantity,
  });
  // Order stays DRAFT — it becomes PENDING_PAYMENT only when the customer
  // confirms in tryConfirmOrder (which also fires automations/webhooks/reminders).

  const detail = await getOrder(db, ctx.tenantId, order.id);
  const total = Number(detail?.order.total ?? 0);
  const displayName = variant ? `${product.name} (${variant.name})` : product.name;

  return {
    orderId: order.id,
    reply: draftSummaryReply(displayName, quantity, total),
    awaitingConfirm: true,
  };
}

/**
 * Step 2 of checkout: the customer confirmed the DRAFT order (tapped
 * "ยืนยันสั่งซื้อ" or typed a clear yes). Promote it to PENDING_PAYMENT, fire the
 * order-created side effects once, and NOW send the payment instruction with the
 * bank account. Payment is still NOT confirmed — only a verified slip/callback
 * flips it to PAID (risk #9). Returns null when there's no confirm intent or no
 * DRAFT order to confirm (so a stray "ยืนยัน" doesn't do anything).
 */
export async function tryConfirmOrder(
  db: DbClient,
  ctx: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    channelId?: string;
    text: string;
  },
): Promise<CheckoutResult> {
  if (matchHandoff(ctx.text)) return null;
  if (!hasConfirmIntent(ctx.text)) return null;

  const existing = await getOpenOrderForConversation(
    db,
    ctx.tenantId,
    ctx.conversationId,
  );
  if (!existing) return null;

  const total = Number(existing.total);
  const paySettings = await getPaymentSettings(db, ctx.tenantId);

  // Already confirmed (PENDING_PAYMENT) → just re-send the instruction.
  if (existing.status !== "DRAFT") {
    return {
      orderId: existing.id,
      reply:
        `ออเดอร์ของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
        buildPaymentInstruction(paySettings, { total }),
    };
  }

  await updateOrderStatus(db, ctx.tenantId, existing.id, "PENDING_PAYMENT");

  await runAutomations(db, ctx.tenantId, "ORDER_CREATED", {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    channelId: ctx.channelId,
  });

  // Nudge if still unpaid a few hours from now (auto-cancelled once they pay).
  if (ctx.channelId) {
    await scheduleCartRecovery(db, {
      tenantId: ctx.tenantId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      channelId: ctx.channelId,
      orderId: existing.id,
      total,
    });
  }

  const detail = await getOrder(db, ctx.tenantId, existing.id);
  const firstItem = detail?.items[0];
  await enqueueWebhookEvent(db, ctx.tenantId, "order.created", {
    orderId: existing.id,
    total,
    quantity: firstItem?.quantity ?? 1,
    productId: firstItem?.productId ?? null,
    productName: firstItem?.nameSnapshot ?? null,
    customerId: ctx.customerId,
  });

  return {
    orderId: existing.id,
    reply:
      `รับทราบค่ะ ยอดชำระ ${total.toLocaleString("th-TH")} บาท ✅\n\n` +
      buildPaymentInstruction(paySettings, { total }),
  };
}
