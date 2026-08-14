import type { DbClient } from "@/db/client";
import { resolveCustomerByIdentity } from "@/db/repositories/customers";
import {
  getOrOpenConversation,
  recordInboundMessage,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import { getLineChannelContext } from "@/db/repositories/line";
import { decryptSecret } from "@/lib/crypto";
import { routeMessage } from "@/features/router/router";
import type { RouterHandlers } from "@/features/router/types";

import { createLineClient, replyText } from "./client";
import { verifyLineSignature } from "./signature";

/** Minimal shape of the LINE webhook events we handle (text messages from users). */
type LineSource = { type?: string; userId?: string };
type LineMessage = { type?: string; id?: string; text?: string };
type LineEvent = {
  type?: string;
  timestamp?: number;
  replyToken?: string;
  source?: LineSource;
  message?: LineMessage;
};

export type LineReplyFn = (replyToken: string, text: string) => Promise<void>;

export type ProcessDeps = {
  /** Level 2/3 handlers for the router (RAG, Gemini). */
  routerHandlers?: RouterHandlers;
  /** Override the reply transport (tests inject a spy instead of hitting LINE). */
  reply?: LineReplyFn;
};

export type LineWebhookResult =
  | { ok: false; status: 400 | 401 | 404 | 409; error: string }
  | { ok: true; status: 200; processed: number; skipped: number; replied: number };

/**
 * End-to-end LINE inbound handling, independent of HTTP:
 *   verify signature → for each text message, resolve customer + thread the
 *   conversation → record inbound (opens 24h window) → route through the
 *   Message Router → reply and record the outbound message.
 */
export async function processLineWebhook(
  db: DbClient,
  channelId: string,
  rawBody: string,
  signature: string | null | undefined,
  deps: ProcessDeps = {},
): Promise<LineWebhookResult> {
  const context = await getLineChannelContext(db, channelId);
  if (!context) return { ok: false, status: 404, error: "unknown channel" };
  if (!context.connection) {
    return { ok: false, status: 409, error: "channel not connected" };
  }

  const channelSecret = decryptSecret(context.connection.channelSecretEncrypted);
  if (!verifyLineSignature(channelSecret, rawBody, signature)) {
    return { ok: false, status: 401, error: "invalid signature" };
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }

  // Reply transport: injected spy in tests, else a real client built from the
  // OA's decrypted access token (built lazily so unrelated events cost nothing).
  let reply = deps.reply;
  const getReply = (): LineReplyFn => {
    if (!reply) {
      const token = decryptSecret(context.connection!.accessTokenEncrypted);
      const client = createLineClient(token);
      reply = (replyToken, text) => replyText(client, replyToken, text);
    }
    return reply;
  };

  const tenantId = context.channel.tenantId;
  const events = payload.events ?? [];
  let processed = 0;
  let skipped = 0;
  let replied = 0;

  for (const event of events) {
    const userId = event.source?.userId;
    const isText =
      event.type === "message" &&
      event.message?.type === "text" &&
      event.source?.type === "user";
    if (!isText || !userId || !event.message?.id) {
      skipped++;
      continue;
    }

    const { customerId } = await resolveCustomerByIdentity(
      db,
      tenantId,
      channelId,
      userId,
    );
    const conversation = await getOrOpenConversation(
      db,
      tenantId,
      customerId,
      channelId,
    );
    const message = await recordInboundMessage(db, tenantId, conversation.id, {
      body: event.message.text,
      channelMessageId: event.message.id,
      at: event.timestamp ? new Date(event.timestamp) : undefined,
    });
    if (!message) {
      skipped++; // duplicate redelivery
      continue;
    }
    processed++;

    // Route and reply. Requires a reply token (single-use, present on real
    // message events); without one there's nothing to answer to.
    if (!event.replyToken) continue;

    const decision = await routeMessage(
      db,
      { tenantId, conversationId: conversation.id, text: event.message.text ?? "" },
      deps.routerHandlers,
    );
    await getReply()(event.replyToken, decision.replyText);
    await recordOutboundMessage(db, tenantId, conversation.id, {
      body: decision.replyText,
    });
    replied++;
  }

  return { ok: true, status: 200, processed, skipped, replied };
}
