import type { DbClient } from "@/db/client";
import {
  countInboundSince,
  getOrOpenConversation,
  getRecentMessages,
  recordInboundMessage,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import {
  FLOOD_WINDOW_MS,
  isFlooding,
  JAILBREAK_REPLY,
  looksLikeJailbreak,
} from "@/features/messaging/guard";
import {
  createPayment,
  getOpenOrderForConversation,
} from "@/db/repositories/orders";
import {
  getCustomer,
  resolveCustomerByIdentity,
} from "@/db/repositories/customers";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { createKnowledgeGap, findOpenGap } from "@/db/repositories/gaps";
import { listReviews } from "@/db/repositories/reviews";
import { addLeadEvent } from "@/db/repositories/leads";
import {
  applyConsentReply,
  CONSENT_PROMPT,
  detectConsentReply,
  getConsentState,
  markConsentPrompted,
} from "@/features/consent/service";
import { matchProduct } from "@/features/router/intent";
import { loadProducts } from "@/features/router/rules";
import { routeMessage } from "@/features/router/router";
import type { RouterHandlers } from "@/features/router/types";
import { tryCheckout } from "@/features/sales/checkout";
import { tryBooking } from "@/features/booking/book-from-chat";
import { tryHotelBooking } from "@/features/hotel/book-from-chat";
import { tryCourseEnroll } from "@/features/course/enroll-from-chat";
import { verifySlip, type SlipVerdict } from "@/features/payment/slip-verify";
import { syncLeadOnInbound } from "@/features/sales/lead-sync";
import {
  wantsProductImage,
  wantsReview,
  wantsWelcome,
} from "@/features/sales/order-intent";

/** Tappable suggestion chips under a reply; tapping `label` sends `text`. */
export type QuickReply = { label: string; text: string };

/** Deliver a reply to the given channel-user. LINE ignores the id (uses a reply
 *  token via closure); Facebook uses it as the PSID. Optional quick replies are
 *  rendered as tappable chips by the channel that supports them. */
export type SendFn = (
  toExternalId: string,
  text: string,
  quickReplies?: QuickReply[],
) => Promise<void>;

/** Escape hatch shown on the bot's conversational replies: one tap asks for a
 *  human, which matchHandoff catches and routes to a live agent. */
const TALK_TO_HUMAN: QuickReply = {
  label: "คุยกับแอดมิน",
  text: "คุยกับแอดมิน",
};

/** Deliver a product image (+ optional caption). Wired per channel. */
export type SendImageFn = (
  toExternalId: string,
  imageUrl: string,
  caption?: string,
) => Promise<void>;

/**
 * A customer sent an image. With an open order it's almost certainly a payment
 * slip, so acknowledge it and log a PENDING payment for the merchant to verify.
 * We NEVER auto-confirm payment from a slip image (risk #9) — a human (or later
 * an OCR/bank check) flips the order to PAID via confirmPayment. Without an open
 * order we just acknowledge so the customer is never left on read.
 */
export async function handleInboundImage(
  db: DbClient,
  args: {
    tenantId: string;
    channelId: string;
    externalId: string;
    channelMessageId?: string;
    slipUrl?: string;
    at?: Date;
    profile?: { displayName?: string; avatarUrl?: string };
    send?: SendFn;
    /** Fetch the image bytes as base64 for OCR (per-channel). Optional: when
     *  absent we just acknowledge the slip without reading it. */
    loadImage?: () => Promise<{ data: string; mimeType: string } | null>;
    /** Injectable slip verifier (tests pass a stub). */
    verify?: typeof verifySlip;
  },
): Promise<InboundResult> {
  const { customerId } = await resolveCustomerByIdentity(
    db,
    args.tenantId,
    args.channelId,
    args.externalId,
    args.profile,
  );
  const conversation = await getOrOpenConversation(
    db,
    args.tenantId,
    customerId,
    args.channelId,
  );
  const message = await recordInboundMessage(db, args.tenantId, conversation.id, {
    body: "[รูปภาพจากลูกค้า]",
    channelMessageId: args.channelMessageId,
    at: args.at,
  });
  if (!message) return { status: "duplicate", replied: false };
  if (!args.send) return { status: "processed", replied: false };

  const order = await getOpenOrderForConversation(db, args.tenantId, conversation.id);
  if (order) {
    const orderTotal = Number(order.total);

    // Our own slip OCR: read the amount off the image and compare to the order.
    // Advisory only — the merchant still confirms manually (risk #9). If we have
    // no image bytes or OCR fails, we fall back to a plain acknowledgement.
    let verdict: SlipVerdict | null = null;
    if (args.loadImage) {
      const image = await args.loadImage();
      if (image) {
        verdict = await (args.verify ?? verifySlip)(image, orderTotal);
      }
    }

    // Claimed amount stays the order total; verifiedAmount records what the slip
    // actually said, so the dashboard can flag mismatches for the merchant.
    await createPayment(db, args.tenantId, order.id, {
      amount: orderTotal,
      slipUrl: args.slipUrl,
      providerRef: verdict?.parsed.ref ?? undefined,
      verifiedAmount: verdict?.verifiedAmount ?? undefined,
      verifyStatus: verdict?.status ?? "UNVERIFIED",
      slipData: verdict?.parsed,
    });

    const orderStr = orderTotal.toLocaleString("th-TH");
    let reply: string;
    if (verdict?.status === "MATCH") {
      reply = `ได้รับสลิปแล้วค่ะ ยอด ${orderStr} บาท ตรงกับออเดอร์พอดี เดี๋ยวทางร้านตรวจสอบและยืนยันให้นะคะ`;
    } else if (verdict?.status === "MISMATCH") {
      const slipStr = (verdict.verifiedAmount ?? 0).toLocaleString("th-TH");
      reply = `ได้รับสลิปแล้วค่ะ แต่ยอดในสลิป (${slipStr} บาท) ดูไม่ตรงกับออเดอร์ (${orderStr} บาท) รบกวนตรวจสอบอีกครั้งนะคะ ถ้าถูกต้องแล้วทางร้านจะยืนยันให้ค่ะ`;
    } else {
      reply = `ได้รับสลิปแล้วค่ะ ยอด ${orderStr} บาท เดี๋ยวทางร้านตรวจสอบและยืนยันออเดอร์ให้นะคะ`;
    }
    await args.send(args.externalId, reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: reply,
      category: "TRANSACTIONAL",
    });
    return { status: "processed", replied: true };
  }

  const reply = "ได้รับรูปแล้วค่ะ ไม่ทราบว่าต้องการสอบถามเรื่องไหน แจ้งได้เลยนะคะ";
  await args.send(args.externalId, reply);
  await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
  return { status: "processed", replied: true };
}

export type InboundResult = {
  status: "processed" | "duplicate";
  replied: boolean;
};

/**
 * Channel-agnostic inbound handling shared by every adapter:
 *   resolve identity → thread conversation → record inbound (opens 24h window)
 *   → CRM lead sync (objection + score) → route → reply → record outbound.
 *
 * When `send` is omitted the message is still recorded and synced but not
 * answered (e.g. a LINE event with no reply token).
 */
export async function handleInboundText(
  db: DbClient,
  args: {
    tenantId: string;
    channelId: string;
    externalId: string;
    text: string;
    channelMessageId?: string;
    at?: Date;
    profile?: { displayName?: string; avatarUrl?: string };
    routerHandlers?: RouterHandlers;
    send?: SendFn;
    sendImage?: SendImageFn;
  },
): Promise<InboundResult> {
  const { customerId } = await resolveCustomerByIdentity(
    db,
    args.tenantId,
    args.channelId,
    args.externalId,
    args.profile,
  );
  const conversation = await getOrOpenConversation(
    db,
    args.tenantId,
    customerId,
    args.channelId,
  );
  const message = await recordInboundMessage(db, args.tenantId, conversation.id, {
    body: args.text,
    channelMessageId: args.channelMessageId,
    at: args.at,
  });
  if (!message) return { status: "duplicate", replied: false };

  const sync = await syncLeadOnInbound(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    text: args.text,
  });

  if (!args.send) return { status: "processed", replied: false };

  // A human has taken over (status HANDOFF) — record the inbound so the agent
  // sees it in the inbox, but stay silent. The bot must never talk over the
  // person handling the conversation; it resumes only when they release it.
  if (conversation.status === "HANDOFF") {
    return { status: "processed", replied: false };
  }

  // Abuse guards — before any AI/commerce, so floods and prompt-injection never
  // cost a model call or bend the bot off-task.
  const recent = await countInboundSince(
    db,
    args.tenantId,
    conversation.id,
    new Date(Date.now() - FLOOD_WINDOW_MS),
  );
  if (isFlooding(recent)) {
    // Silently drop — a real customer never types this fast; don't feed abuse.
    return { status: "processed", replied: false };
  }
  if (looksLikeJailbreak(args.text)) {
    await args.send(args.externalId, JAILBREAK_REPLY);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: JAILBREAK_REPLY,
    });
    return { status: "processed", replied: true };
  }

  // Checkout: a clear "buy this product" message creates the order + sends the
  // payment instruction (DB prices only, payment stays unconfirmed — risk #5/#9).
  const checkout = await tryCheckout(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    channelId: args.channelId,
    text: args.text,
  });
  if (checkout) {
    await args.send(args.externalId, checkout.reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: checkout.reply,
      category: "TRANSACTIONAL",
    });
    await addLeadEvent(db, args.tenantId, sync.leadId, "order_created", {
      orderId: checkout.orderId,
    });
    return { status: "processed", replied: true };
  }

  // Hotel: room availability questions + real date-range bookings (only fires
  // for tenants that have room types; otherwise falls through).
  const hotel = await tryHotelBooking(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    channelId: args.channelId,
    text: args.text,
  });
  if (hotel) {
    await args.send(args.externalId, hotel.reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: hotel.reply,
      category: hotel.bookingId ? "TRANSACTIONAL" : "CONVERSATIONAL",
    });
    if (hotel.bookingId) {
      await addLeadEvent(db, args.tenantId, sync.leadId, "hotel_booking_created", {
        bookingId: hotel.bookingId,
      });
    }
    return { status: "processed", replied: true };
  }

  // Course: list courses + enrol a student (seat-limited). Only fires for
  // tenants that have courses; otherwise falls through.
  const course = await tryCourseEnroll(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    text: args.text,
  });
  if (course) {
    await args.send(args.externalId, course.reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: course.reply,
      category: course.enrollmentId ? "TRANSACTIONAL" : "CONVERSATIONAL",
    });
    if (course.enrollmentId) {
      await addLeadEvent(db, args.tenantId, sync.leadId, "course_enrolled", {
        enrollmentId: course.enrollmentId,
      });
    }
    return { status: "processed", replied: true };
  }

  // Booking: a clear "book service X at time Y" creates a real appointment
  // (same double-booking guard as the dashboard) and confirms.
  const booking = await tryBooking(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    channelId: args.channelId,
    text: args.text,
  });
  if (booking) {
    await args.send(args.externalId, booking.reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: booking.reply,
      category: "TRANSACTIONAL",
    });
    if (booking.appointmentId) {
      await addLeadEvent(db, args.tenantId, sync.leadId, "appointment_created", {
        appointmentId: booking.appointmentId,
      });
    }
    return { status: "processed", replied: true };
  }

  // "Can I see a photo?" — send the product image if we can identify the product
  // (from this message, else from the recent chat) and it has one.
  if (args.sendImage && wantsProductImage(args.text)) {
    const catalog = await loadProducts(db, args.tenantId);
    let product = matchProduct(args.text, catalog);
    if (!product) {
      const recent = await getRecentMessages(db, args.tenantId, conversation.id, 6);
      const context = recent.map((m) => m.body).join(" ");
      product = matchProduct(context, catalog);
    }
    if (product?.imageUrl) {
      const caption = `${product.name} ค่ะ`;
      await args.sendImage(args.externalId, product.imageUrl, caption);
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งรูป] ${product.name}`,
      });
      return { status: "processed", replied: true };
    }
    if (product) {
      const reply = `ตอนนี้ยังไม่มีรูป ${product.name} ในระบบเลยค่ะ เดี๋ยวแอดมินส่งให้อีกทีนะคะ`;
      await args.send(args.externalId, reply);
      await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
      return { status: "processed", replied: true };
    }
    // No product identified → fall through so the AI can ask which one.
  }

  // First greeting / "what do you sell?" → auto-send the shop's promo banner
  // (no need for the customer to ask for a picture). Only if one is configured.
  if (args.sendImage && wantsWelcome(args.text)) {
    const s = await getTenantAiSettings(db, args.tenantId);
    if (s?.welcomeImageUrl) {
      await args.sendImage(
        args.externalId,
        s.welcomeImageUrl,
        s.welcomeMessage ?? undefined,
      );
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งโปรโมท] ${s.welcomeMessage ?? ""}`.trim(),
      });
      return { status: "processed", replied: true };
    }
    // No banner set → fall through to the normal AI greeting.
  }

  // "มีรีวิวไหม" — send social proof. One review image per reply (LINE's reply
  // token is single-use); falls back to text testimonials, else lets the AI answer.
  if (wantsReview(args.text)) {
    const revs = await listReviews(db, args.tenantId);
    const withImage = revs.find((r) => r.imageUrl);
    if (withImage?.imageUrl && args.sendImage) {
      const caption = withImage.caption
        ? `"${withImage.caption}"${withImage.authorName ? ` — ${withImage.authorName}` : ""}`
        : "รีวิวจากลูกค้าค่ะ";
      await args.sendImage(args.externalId, withImage.imageUrl, caption);
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งรีวิว] ${caption}`,
      });
      return { status: "processed", replied: true };
    }
    const textReviews = revs
      .filter((r) => r.caption)
      .slice(0, 3)
      .map((r) => `"${r.caption}"${r.authorName ? ` — ${r.authorName}` : ""}`)
      .join("\n");
    if (textReviews) {
      const reply = `รีวิวจากลูกค้าของเราค่ะ\n${textReviews}`;
      await args.send(args.externalId, reply);
      await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
      return { status: "processed", replied: true };
    }
    // No reviews yet → fall through so the AI answers naturally.
  }

  // PDPA profiling opt-in (risk #3): if the customer hasn't decided yet and this
  // message is a yes/no, capture it and reply with an acknowledgment.
  const customer = await getCustomer(db, args.tenantId, customerId);
  const consent = await getConsentState(
    db,
    args.tenantId,
    customerId,
    customer?.profilingConsent ?? false,
  );
  const consentReply = detectConsentReply(args.text);
  if (!consent.decided && consentReply) {
    const ack = await applyConsentReply(
      db,
      args.tenantId,
      customerId,
      consentReply,
    );
    await args.send(args.externalId, ack);
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: ack,
    });
    return { status: "processed", replied: true };
  }

  const decision = await routeMessage(
    db,
    { tenantId: args.tenantId, conversationId: conversation.id, text: args.text },
    args.routerHandlers,
  );

  // Append the one-time consent prompt to the first bot reply.
  let replyText = decision.replyText;
  if (!consent.decided && !consent.prompted) {
    replyText = `${replyText}\n\n${CONSENT_PROMPT}`;
    await markConsentPrompted(db, args.tenantId, customerId);
  }

  // Offer a one-tap "talk to a human" on normal bot replies — but not when we're
  // already handing off (they're getting a human anyway).
  const quickReplies =
    decision.action === "handoff" ? undefined : [TALK_TO_HUMAN];
  await args.send(args.externalId, replyText, quickReplies);
  await recordOutboundMessage(db, args.tenantId, conversation.id, {
    body: replyText,
  });
  if (decision.action === "handoff") {
    await addLeadEvent(db, args.tenantId, sync.leadId, "handoff", {
      reason: decision.handoffReason,
    });
    // A "fallback" handoff means nothing could answer — log it to the Knowledge
    // Gap Inbox so an admin can teach the bot once (docs/01). Intentional
    // handoffs (refund/dispute keywords) are not gaps.
    if (decision.source === "fallback") {
      const existing = await findOpenGap(db, args.tenantId, args.text);
      if (!existing) {
        await createKnowledgeGap(db, args.tenantId, {
          question: args.text,
          conversationId: conversation.id,
        });
      }
    }
  }
  return { status: "processed", replied: true };
}
