import type { DbClient } from "@/db/client";
import { scheduleFollowup } from "@/db/repositories/followups";
import { getOrderFollowupContext } from "@/db/repositories/orders";

/** How long an unpaid order sits before we nudge about it. Short enough to
 *  stay inside the Meta 24h window, long enough not to feel pushy. */
export const CART_RECOVERY_DELAY_MS = 3 * 60 * 60 * 1000;

/** How long after an order is fulfilled we ask for a review. */
export const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nudge a customer who created an order but hasn't paid. Scheduled right after
 * checkout. Carries the orderId so the follow-up engine can skip it if the
 * order is paid or cancelled by the time it comes due. CONVERSATIONAL category
 * → it's gated to the 24h window on Messenger (compliant), always OK on LINE.
 */
export async function scheduleCartRecovery(
  db: DbClient,
  args: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    channelId: string;
    orderId: string;
    total: number;
    now?: Date;
  },
): Promise<void> {
  const now = args.now ?? new Date();
  const total = args.total.toLocaleString("th-TH");
  await scheduleFollowup(db, args.tenantId, {
    customerId: args.customerId,
    conversationId: args.conversationId,
    channelId: args.channelId,
    category: "CONVERSATIONAL",
    scheduledAt: new Date(now.getTime() + CART_RECOVERY_DELAY_MS),
    payload: {
      orderId: args.orderId,
      text:
        `ยังอยู่ไหมคะ ออเดอร์ยอด ${total} บาทของคุณยังรอชำระอยู่นะคะ ` +
        `ถ้าต้องการให้ช่วยอะไรเพิ่มเติม หรืออยากได้ช่องทางชำระอีกครั้ง บอกได้เลยค่ะ`,
    },
    reason: "cart_recovery",
  });
}

/**
 * Ask for a review a day after an order is fulfilled. Resolves the channel and
 * conversation from the order itself, so callers only pass the orderId. Returns
 * false (no-op) when the order can't be reached via a channel.
 */
export async function scheduleReviewRequest(
  db: DbClient,
  args: { tenantId: string; orderId: string; now?: Date },
): Promise<boolean> {
  const ctx = await getOrderFollowupContext(db, args.tenantId, args.orderId);
  if (!ctx) return false;
  const now = args.now ?? new Date();
  await scheduleFollowup(db, args.tenantId, {
    customerId: ctx.customerId,
    conversationId: ctx.conversationId,
    channelId: ctx.channelId,
    category: "CONVERSATIONAL",
    scheduledAt: new Date(now.getTime() + REVIEW_DELAY_MS),
    payload: {
      text:
        `ขอบคุณที่อุดหนุนนะคะ 🙏 ไม่ทราบว่าสินค้า/บริการเป็นอย่างไรบ้างคะ ` +
        `ถ้าประทับใจ รบกวนรีวิวให้หน่อยได้ไหมคะ ความเห็นของคุณมีค่ากับร้านมากเลยค่ะ`,
    },
    reason: "review_request",
  });
  return true;
}
