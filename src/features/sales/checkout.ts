import type { DbClient } from "@/db/client";
import {
  addOrderItem,
  createOrder,
  getOpenOrderForConversation,
  getOrder,
  orderHasPhysicalItem,
  removeOrderItemsByProduct,
  updateOrderStatus,
} from "@/db/repositories/orders";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { runAutomations } from "@/features/automation/engine";
import { scheduleCartRecovery } from "@/features/reminders/order-events";
import { enqueueWebhookEvent } from "@/features/webhooks/dispatch";
import { matchHandoff, matchProductOrVariant } from "@/features/router/intent";
import { loadProducts } from "@/features/router/rules";
import { buildPaymentInstruction } from "@/features/payment/instruction";
import { formatVariantDisplayName } from "@/lib/product-name";

import type { MessageCard } from "@/features/messaging/cards";

import {
  hasBuyIntent,
  hasConfirmIntent,
  looksLikeQuestion,
  parseQuantity,
} from "./order-intent";

/** Button texts must match what tryConfirmOrder / matchHandoff detect, so a card
 *  button routes exactly like the equivalent quick-reply chip. */
const CONFIRM_ACTION = { label: "✅ ยืนยันสั่งซื้อ", text: "ยืนยันสั่งซื้อ" };
const HUMAN_ACTION = { label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" };

export type CheckoutResult = {
  orderId: string;
  reply: string;
  /** True when we've drafted an order and are waiting for the customer to tap
   *  "ยืนยันสั่งซื้อ". The pipeline attaches the confirm chip in this case and does
   *  NOT reveal the bank account yet (account is only sent on confirm). */
  awaitingConfirm?: boolean;
  /** Rich card the channel renders (LINE Flex / FB template). Falls back to
   *  `reply` text on channels/tests without card support. */
  card?: MessageCard;
} | null;

/** Build the payment card from the store's payout settings + order total. Mirrors
 *  buildPaymentInstruction, but as structured rows the channel renders richly. */
function buildPaymentCard(
  settings: Awaited<ReturnType<typeof getPaymentSettings>>,
  total: number,
  fallback: string,
): MessageCard {
  const rows: { label: string; value: string }[] = [];
  if (settings?.bankName || settings?.bankAccountNo) {
    rows.push({
      label: settings?.bankName ?? "ธนาคาร",
      value: settings?.bankAccountNo ?? "-",
    });
    if (settings?.bankAccountName) {
      rows.push({ label: "ชื่อบัญชี", value: settings.bankAccountName });
    }
  }
  if (settings?.promptpayId) {
    rows.push({ label: "พร้อมเพย์", value: settings.promptpayId });
  }
  // Copy button (LINE clipboard) for the account/PromptPay number — flex text
  // isn't selectable on LINE, so a one-tap copy saves the customer retyping it.
  const copyTarget = settings?.bankAccountNo || settings?.promptpayId;
  const actions = copyTarget
    ? [{ label: "📋 คัดลอกเลขบัญชี", copy: copyTarget }, HUMAN_ACTION]
    : [HUMAN_ACTION];
  return {
    kind: "payment",
    title: "ช่องทางชำระเงิน 💳",
    amountLabel: `ยอดชำระ ${total.toLocaleString("th-TH")} บาท`,
    rows,
    note: "โอนแล้วส่งสลิปในแชทได้เลยนะคะ ทางร้านจะตรวจสอบและยืนยันให้ค่ะ 🙏",
    actions,
    fallback,
  };
}

/** The "ยืนยันคำสั่งซื้อ" card shown while a DRAFT awaits confirmation. */
function buildConfirmCard(
  productName: string,
  imageUrl: string | null | undefined,
  total: number,
  fallback: string,
): MessageCard {
  return {
    kind: "order_confirm",
    title: "ยืนยันคำสั่งซื้อ",
    productName,
    imageUrl: imageUrl ?? null,
    detail: `ยอดรวม ${total.toLocaleString("th-TH")} บาท`,
    actions: [CONFIRM_ACTION, HUMAN_ACTION],
    fallback,
  };
}

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
    if (existing.status === "PENDING_PAYMENT") {
      const paySettings = await getPaymentSettings(db, ctx.tenantId);
      const before = await getOrder(db, ctx.tenantId, existing.id);
      const already = before?.items.find((it) => it.productId === product.id);
      // Customer adds ANOTHER product after confirming → append it to the same
      // order and re-send the updated payment instruction (cart keeps one order).
      if (!already) {
        const quantity = parseQuantity(ctx.text);
        await addOrderItem(db, ctx.tenantId, existing.id, {
          productId: variant ? undefined : product.id,
          variantId: variant?.id,
          quantity,
        });
        const detail = await getOrder(db, ctx.tenantId, existing.id);
        const total = Number(detail?.order.total ?? 0);
        const hasPhysical = await orderHasPhysicalItem(db, ctx.tenantId, existing.id);
        const displayName = formatVariantDisplayName(product.name, variant?.name);
        return {
          orderId: existing.id,
          reply:
            `เพิ่ม ${displayName} แล้วค่ะ ยอดรวมใหม่ ${total.toLocaleString("th-TH")} บาท ✅\n\n` +
            buildPaymentInstruction(paySettings, { total, hasPhysical }),
        };
      }
      // Same product re-mentioned → just re-send the current instruction.
      const total = Number(existing.total);
      const hasPhysical = await orderHasPhysicalItem(db, ctx.tenantId, existing.id);
      return {
        orderId: existing.id,
        reply:
          `ออเดอร์เดิมของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
          buildPaymentInstruction(paySettings, { total, hasPhysical }),
      };
    }
    // DRAFT order still open. Three cases for the newly-named product:
    const quantity = parseQuantity(ctx.text);
    const before = await getOrder(db, ctx.tenantId, existing.id);
    const already = before?.items.find((it) => it.productId === product.id);
    const displayName = formatVariantDisplayName(product.name, variant?.name);

    if (already && variant) {
      // Same product, a (possibly different) variant named → SWITCH: drop the old
      // line(s) for this product and add the chosen variant. Fixes "changed to
      // Premium but the total stayed at the old price".
      await removeOrderItemsByProduct(db, ctx.tenantId, existing.id, product.id);
      await addOrderItem(db, ctx.tenantId, existing.id, {
        variantId: variant.id,
        quantity,
      });
      const detail = await getOrder(db, ctx.tenantId, existing.id);
      const total = Number(detail?.order.total ?? 0);
      const reply =
        `เปลี่ยนเป็น ${displayName} แล้วค่ะ ยอดรวม ${total.toLocaleString("th-TH")} บาท\n\n` +
        `ยืนยันสั่งซื้อไหมคะ? กดปุ่ม "ยืนยันสั่งซื้อ" ด้านล่างเพื่อรับข้อมูลการโอนได้เลยค่ะ 😊`;
      return {
        orderId: existing.id,
        reply,
        awaitingConfirm: true,
        card: buildConfirmCard(displayName, product.imageUrl, total, reply),
      };
    }

    if (already) {
      // Same product re-mentioned without a new variant → don't duplicate; just
      // re-summarize the current order.
      const total = Number(before?.order.total ?? 0);
      const reply =
        `ออเดอร์ของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ\n\n` +
        `ยืนยันสั่งซื้อไหมคะ? กดปุ่ม "ยืนยันสั่งซื้อ" ด้านล่างเพื่อรับข้อมูลการโอนได้เลยค่ะ 😊`;
      return { orderId: existing.id, reply, awaitingConfirm: true };
    }

    // A different product → add it to the SAME order (cart) and re-summarize.
    await addOrderItem(db, ctx.tenantId, existing.id, {
      productId: variant ? undefined : product.id,
      variantId: variant?.id,
      quantity,
    });
    const detail = await getOrder(db, ctx.tenantId, existing.id);
    const total = Number(detail?.order.total ?? 0);
    const reply =
      `เพิ่ม ${displayName} จำนวน ${quantity} ชิ้นแล้วค่ะ ` +
      `ยอดรวมตอนนี้ ${total.toLocaleString("th-TH")} บาท\n\n` +
      `ยืนยันสั่งซื้อไหมคะ? กดปุ่ม "ยืนยันสั่งซื้อ" ด้านล่างเพื่อรับข้อมูลการโอนได้เลยค่ะ 😊`;
    return {
      orderId: existing.id,
      reply,
      awaitingConfirm: true,
      card: buildConfirmCard(displayName, product.imageUrl, total, reply),
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
  const displayName = formatVariantDisplayName(product.name, variant?.name);
  const reply = draftSummaryReply(displayName, quantity, total);

  return {
    orderId: order.id,
    reply,
    awaitingConfirm: true,
    card: {
      kind: "order_confirm",
      title: "ยืนยันคำสั่งซื้อ",
      productName: displayName,
      imageUrl: product.imageUrl ?? null,
      detail: `จำนวน ${quantity} • รวม ${total.toLocaleString("th-TH")} บาท`,
      actions: [CONFIRM_ACTION, HUMAN_ACTION],
      fallback: reply,
    },
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
  const hasPhysical = await orderHasPhysicalItem(db, ctx.tenantId, existing.id);

  // Already confirmed (PENDING_PAYMENT) → just re-send the instruction.
  if (existing.status !== "DRAFT") {
    return {
      orderId: existing.id,
      reply:
        `ออเดอร์ของคุณยอดรวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
        buildPaymentInstruction(paySettings, { total, hasPhysical }),
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

  const confirmReply =
    `รับทราบค่ะ ยอดชำระ ${total.toLocaleString("th-TH")} บาท ✅\n\n` +
    buildPaymentInstruction(paySettings, { total, hasPhysical });
  return {
    orderId: existing.id,
    reply: confirmReply,
    card: buildPaymentCard(paySettings, total, confirmReply),
  };
}
