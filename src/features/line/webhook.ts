import type { DbClient } from "@/db/client";
import { resolveCustomerByIdentity } from "@/db/repositories/customers";
import {
  getOrOpenConversation,
  recordInboundMessage,
} from "@/db/repositories/conversations";
import { getLineChannelContext } from "@/db/repositories/line";
import { decryptSecret } from "@/lib/crypto";

import { verifyLineSignature } from "./signature";

/** Minimal shape of the LINE webhook events we handle (text messages from users). */
type LineSource = { type?: string; userId?: string };
type LineMessage = { type?: string; id?: string; text?: string };
type LineEvent = {
  type?: string;
  timestamp?: number;
  source?: LineSource;
  message?: LineMessage;
};

export type LineWebhookResult =
  | { ok: false; status: 400 | 401 | 404 | 409; error: string }
  | { ok: true; status: 200; processed: number; skipped: number };

/**
 * End-to-end LINE inbound handling, independent of HTTP so it can be unit-tested:
 * resolve channel+tenant → verify signature over the raw body → for each text
 * message, resolve the customer identity, thread the conversation, and record
 * the inbound message (which also opens the 24h window — risk #1).
 */
export async function processLineWebhook(
  db: DbClient,
  channelId: string,
  rawBody: string,
  signature: string | null | undefined,
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

  const tenantId = context.channel.tenantId;
  const events = payload.events ?? [];
  let processed = 0;
  let skipped = 0;

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
    if (message) processed++;
    else skipped++; // duplicate redelivery
  }

  return { ok: true, status: 200, processed, skipped };
}
