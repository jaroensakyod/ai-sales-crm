import type { DbClient } from "@/db/client";
import {
  countInboundSince,
  getOrOpenConversation,
  getRecentMessages,
  recordInboundMessage,
  recordOutboundMessage,
  setConversationStatus,
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
import {
  listActiveQuickReplies,
  quickReplyMatches,
} from "@/db/repositories/quickReplies";
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
import type {
  FlexStyle,
  MessageCard,
  SendCardFn,
} from "@/features/messaging/cards";
import {
  findFlexCardByTrigger,
  flexCardToMessageCard,
} from "@/db/repositories/flexCards";
import { tryCheckout, tryConfirmOrder } from "@/features/sales/checkout";
import { tryBooking } from "@/features/booking/book-from-chat";
import { tryHotelBooking } from "@/features/hotel/book-from-chat";
import { tryCourseEnroll } from "@/features/course/enroll-from-chat";
import { verifySlip, type SlipVerdict } from "@/features/payment/slip-verify";
import { syncLeadOnInbound } from "@/features/sales/lead-sync";
import {
  wantsCatalog,
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

/** Shown under a drafted order: one tap confirms the purchase, which
 *  tryConfirmOrder catches and only THEN sends the bank account details. */
const CONFIRM_ORDER: QuickReply = {
  label: "ยืนยันสั่งซื้อ",
  text: "ยืนยันสั่งซื้อ",
};

/** Shown on a handoff reply so a customer who tapped "คุยกับแอดมิน" by mistake
 *  can hand the chat back to the bot — but only while no admin has actually
 *  taken over (see the resume guard in handleInboundText). */
const BACK_TO_AI: QuickReply = {
  label: "🤖 กลับมาคุยกับ AI",
  text: "กลับมาคุยกับ AI",
};

/** Build a swipeable product carousel from the live catalog (each bubble = one
 *  product with a "สั่งซื้อ {name}" button that routes into the order flow). */
function productCarousel(
  products: Awaited<ReturnType<typeof loadProducts>>,
): MessageCard {
  const cards = products.slice(0, 10).map((p) => {
    // Show the variant options (สี/ไซซ์/รุ่น) right on the card, each with its own
    // price, so the customer sees the choices without asking.
    const variantLines = (p.variants ?? [])
      .map((v) => {
        const vp =
          v.price != null
            ? ` — ${Number(v.price).toLocaleString("th-TH")} บาท`
            : "";
        return `• ${v.name}${vp}`;
      })
      .join("\n");
    const body = [p.description ?? "", variantLines].filter(Boolean).join("\n") || undefined;
    return {
    kind: "custom_flex" as const,
    imageUrl: p.imageUrl ?? null,
    headline: p.name,
    // Description + variant options so the auto catalog matches a merchant-built
    // carousel (both show info) — no more "one has text, one doesn't".
    body,
    priceLabel: p.price
      ? `เพียง ${Number(p.price).toLocaleString("th-TH")} บาท`
      : undefined,
    style: "plain" as const,
    actions: [{ label: "สั่งซื้อเลย", text: `สั่งซื้อ ${p.name}` }],
    fallback: p.name,
    };
  });
  return {
    kind: "carousel",
    cards,
    fallback: cards.map((c) => c.headline).join(" · "),
  };
}

/** Chips shown under normal bot replies: the merchant's menu buttons first, then
 *  the "talk to a human" escape hatch. LINE/FB allow at most 13 quick replies. */
function menuChips(
  menu: { label: string }[],
): QuickReply[] {
  const chips: QuickReply[] = menu
    .slice(0, 12)
    .map((m) => ({ label: m.label, text: m.label }));
  chips.push(TALK_TO_HUMAN);
  return chips.slice(0, 13);
}

/** Did the customer ask to return to the bot (tapped the resume chip)? */
function wantsBackToAi(text: string): boolean {
  const n = text.trim().toLowerCase();
  return (
    n.includes("กลับมาคุยกับ ai") ||
    n.includes("กลับไปคุยกับ ai") ||
    n.includes("คุยกับ ai") ||
    n.includes("คุยกับบอท")
  );
}

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

  // No open order — but the image might still be a payment slip the customer sent
  // before we recorded an order (e.g. they paid off a chat quote). Try OCR: if it
  // reads like a transfer slip, treat it as an orphan payment — acknowledge with
  // the amount and hand off so an admin can match it to the right order, instead
  // of the old "ไม่ทราบว่าต้องการสอบถามเรื่องไหน" dead-end.
  if (args.loadImage) {
    const image = await args.loadImage();
    if (image) {
      // orderTotal 0 → we only care whether an amount was read off the slip.
      const verdict = await (args.verify ?? verifySlip)(image, 0);
      if (verdict.verifiedAmount != null) {
        const amtStr = verdict.verifiedAmount.toLocaleString("th-TH");
        const reply =
          `ได้รับสลิปโอนเงินแล้วค่ะ (ยอด ${amtStr} บาท) 🙏 ` +
          `แต่ยังไม่พบออเดอร์ในระบบ รบกวนแจ้งชื่อสินค้า/รายการที่สั่งด้วยนะคะ ` +
          `เดี๋ยวแอดมินตรวจสอบและยืนยันให้ค่ะ`;
        await setConversationStatus(db, args.tenantId, conversation.id, "HANDOFF");
        await args.send(args.externalId, reply);
        await recordOutboundMessage(db, args.tenantId, conversation.id, {
          body: reply,
          category: "TRANSACTIONAL",
        });
        return { status: "processed", replied: true };
      }
    }
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
    /** Rich-card sender (LINE Flex / FB template). When absent, cards degrade to
     *  their plain-text fallback via `send`. */
    sendCard?: SendCardFn;
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

  // Resume: the customer tapped "🤖 กลับมาคุยกับ AI" (or asked to talk to the bot).
  // Only honour it while NO admin has claimed the chat (assignedUserId null) — a
  // customer-initiated handoff sets status via setConversationStatus and leaves
  // assignedUserId null, whereas a real takeover stamps the agent's id. This lets
  // a mis-tap of "คุยกับแอดมิน" bounce straight back without overriding a live agent.
  if (
    conversation.status === "HANDOFF" &&
    conversation.assignedUserId == null &&
    wantsBackToAi(args.text)
  ) {
    await setConversationStatus(db, args.tenantId, conversation.id, "OPEN");
    const reply = "กลับมาที่ผู้ช่วย AI แล้วนะคะ 😊 มีอะไรให้ช่วยต่อไหมคะ";
    await args.send(args.externalId, reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
    return { status: "processed", replied: true };
  }

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

  // Merchant quick-reply menu — loaded once and reused for both tap-detection and
  // the chips attached to the final reply. A tap sends the label back verbatim;
  // match it exactly and answer with the canned reply (self-service, no human).
  const menu = await listActiveQuickReplies(db, args.tenantId);
  const tapped = menu.find((m) => quickReplyMatches(m, args.text));
  if (tapped) {
    await args.send(args.externalId, tapped.reply, menuChips(menu));
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: tapped.reply,
    });
    return { status: "processed", replied: true };
  }

  // Confirm: the customer tapped "ยืนยันสั่งซื้อ" (or typed a clear yes) on a
  // drafted order. Promote it to PENDING_PAYMENT and NOW send the bank account.
  const confirmed = await tryConfirmOrder(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    channelId: args.channelId,
    text: args.text,
  });
  if (confirmed) {
    if (args.sendCard && confirmed.card) {
      await args.sendCard(args.externalId, confirmed.card);
    } else {
      await args.send(args.externalId, confirmed.reply);
    }
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: confirmed.reply,
      category: "TRANSACTIONAL",
    });
    await addLeadEvent(db, args.tenantId, sync.leadId, "order_created", {
      orderId: confirmed.orderId,
    });
    return { status: "processed", replied: true };
  }

  // Checkout: a clear "buy this product" message drafts an order and asks the
  // customer to confirm (DB prices only — risk #5). The bank account is NOT sent
  // here; it's revealed only after confirmation above (risk #9).
  const checkout = await tryCheckout(db, {
    tenantId: args.tenantId,
    customerId,
    conversationId: conversation.id,
    channelId: args.channelId,
    text: args.text,
  });
  if (checkout) {
    if (args.sendCard && checkout.card) {
      // Card carries its own buttons (confirm / talk-to-human).
      await args.sendCard(args.externalId, checkout.card);
    } else {
      // Text fallback: a drafted order gets the confirm chip; a re-send doesn't.
      const chips = checkout.awaitingConfirm
        ? [CONFIRM_ORDER, TALK_TO_HUMAN]
        : undefined;
      await args.send(args.externalId, checkout.reply, chips);
    }
    await recordOutboundMessage(db, args.tenantId, conversation.id, {
      body: checkout.reply,
      category: "TRANSACTIONAL",
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

  // "มีสินค้าอะไรบ้าง" → show the catalog. Priority: a merchant Flex card whose
  // trigger matches, else an auto-built product carousel (Flex), else a plain
  // text list of every product (channels without card support). Kept separate
  // from the welcome greeting so the two never collide.
  if (wantsCatalog(args.text)) {
    const custom = await findFlexCardByTrigger(db, args.tenantId, args.text);
    if (custom && args.sendCard) {
      await args.sendCard(args.externalId, flexCardToMessageCard(custom));
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งการ์ด] ${custom.name}`,
      });
      return { status: "processed", replied: true };
    }
    const catalog = await loadProducts(db, args.tenantId);
    if (catalog.length === 0) {
      const reply = "ตอนนี้ยังไม่มีสินค้าในระบบค่ะ เดี๋ยวแอดมินแจ้งเพิ่มให้นะคะ";
      await args.send(args.externalId, reply);
      await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
      return { status: "processed", replied: true };
    }
    if (args.sendCard) {
      await args.sendCard(args.externalId, productCarousel(catalog));
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งการ์ดสินค้า] ${catalog.length} รายการ`,
      });
      return { status: "processed", replied: true };
    }
    // No card support on this channel → list every product as text.
    const list = catalog
      .map((p) => `• ${p.name} — ${Number(p.price).toLocaleString("th-TH")} บาท`)
      .join("\n");
    const reply =
      `สินค้าของเรามีดังนี้ค่ะ\n${list}\n\n` +
      `สนใจตัวไหน พิมพ์ "สั่งซื้อ ชื่อสินค้า" ได้เลยนะคะ 😊`;
    await args.send(args.externalId, reply);
    await recordOutboundMessage(db, args.tenantId, conversation.id, { body: reply });
    return { status: "processed", replied: true };
  }

  // First greeting → auto-send the shop's promo banner (no need for the customer
  // to ask for a picture). Only if one is configured.
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

    // 2+ image reviews and a card-capable channel → swipeable Flex carousel of
    // reviews (one bubble each). Style is the merchant's choice (reviews page).
    const imaged = revs.filter((r) => r.imageUrl);
    if (imaged.length >= 2 && args.sendCard) {
      const s = await getTenantAiSettings(db, args.tenantId);
      const style = (s?.reviewCardStyle as FlexStyle | null) ?? "plain";
      const cards = imaged.slice(0, 10).map((r) => ({
        kind: "custom_flex" as const,
        imageUrl: r.imageUrl,
        headline: r.authorName ? `รีวิวจาก ${r.authorName}` : "รีวิวจากลูกค้า",
        body: r.caption ?? undefined,
        style,
        actions: [],
        fallback: r.caption ?? "รีวิวจากลูกค้า",
      }));
      await args.sendCard(args.externalId, {
        kind: "carousel",
        cards,
        fallback: "รีวิวจากลูกค้าค่ะ",
      });
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งรีวิว] ${cards.length} รายการ`,
      });
      return { status: "processed", replied: true };
    }

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

  // Merchant-designed card triggers: if the message contains a card's trigger
  // keyword, send that card (LINE Flex / FB template) — or its text fallback on a
  // channel without card support. Fires after checkout/booking so a real buy
  // message still creates an order first.
  {
    const triggered = await findFlexCardByTrigger(db, args.tenantId, args.text);
    if (triggered) {
      const card = flexCardToMessageCard(triggered);
      if (args.sendCard) {
        await args.sendCard(args.externalId, card);
      } else {
        await args.send(args.externalId, card.fallback, [TALK_TO_HUMAN]);
      }
      await recordOutboundMessage(db, args.tenantId, conversation.id, {
        body: `[ส่งการ์ด] ${triggered.name}`,
      });
      return { status: "processed", replied: true };
    }
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

  // On a normal reply, show the merchant menu + "talk to a human". On a handoff,
  // offer the reverse — "back to AI" — so a mis-tap is one tap to undo (honoured
  // only while no admin has taken over; see the resume guard above).
  const quickReplies =
    decision.action === "handoff" ? [BACK_TO_AI] : menuChips(menu);
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
