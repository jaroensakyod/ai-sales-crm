import type { DbClient } from "@/db/client";
import {
  addOrderItem,
  createOrder,
  getOrder,
  updateOrderStatus,
} from "@/db/repositories/orders";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { matchProduct } from "@/features/router/intent";
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
    text: string;
  },
): Promise<CheckoutResult> {
  if (!hasBuyIntent(ctx.text)) return null;

  const product = matchProduct(ctx.text, await loadProducts(db, ctx.tenantId));
  if (!product) return null;

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
  const paySettings = await getPaymentSettings(db, ctx.tenantId);

  const reply =
    `รับ ${product.name} จำนวน ${quantity} ชิ้น ` +
    `รวม ${total.toLocaleString("th-TH")} บาทค่ะ ✅\n\n` +
    buildPaymentInstruction(paySettings, { total });

  return { orderId: order.id, reply };
}
