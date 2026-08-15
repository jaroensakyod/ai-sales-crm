import type { DbClient } from "@/db/client";
import {
  getOrOpenConversation,
  recordInboundMessage,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import {
  getCustomer,
  resolveCustomerByIdentity,
} from "@/db/repositories/customers";
import { createKnowledgeGap, findOpenGap } from "@/db/repositories/gaps";
import { addLeadEvent } from "@/db/repositories/leads";
import {
  applyConsentReply,
  CONSENT_PROMPT,
  detectConsentReply,
  getConsentState,
  markConsentPrompted,
} from "@/features/consent/service";
import { routeMessage } from "@/features/router/router";
import type { RouterHandlers } from "@/features/router/types";
import { tryCheckout } from "@/features/sales/checkout";
import { syncLeadOnInbound } from "@/features/sales/lead-sync";

/** Deliver a reply to the given channel-user. LINE ignores the id (uses a reply
 *  token via closure); Facebook uses it as the PSID. */
export type SendFn = (toExternalId: string, text: string) => Promise<void>;

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

  await args.send(args.externalId, replyText);
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
