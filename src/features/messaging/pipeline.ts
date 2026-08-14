import type { DbClient } from "@/db/client";
import {
  getOrOpenConversation,
  recordInboundMessage,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import { resolveCustomerByIdentity } from "@/db/repositories/customers";
import { addLeadEvent } from "@/db/repositories/leads";
import { routeMessage } from "@/features/router/router";
import type { RouterHandlers } from "@/features/router/types";
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

  const decision = await routeMessage(
    db,
    { tenantId: args.tenantId, conversationId: conversation.id, text: args.text },
    args.routerHandlers,
  );
  await args.send(args.externalId, decision.replyText);
  await recordOutboundMessage(db, args.tenantId, conversation.id, {
    body: decision.replyText,
  });
  if (decision.action === "handoff") {
    await addLeadEvent(db, args.tenantId, sync.leadId, "handoff", {
      reason: decision.handoffReason,
    });
  }
  return { status: "processed", replied: true };
}
