import type { DbClient } from "@/db/client";
import {
  getConversationSendContext,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import { getFacebookChannelContext } from "@/db/repositories/facebook";
import { getLineChannelContext } from "@/db/repositories/line";
import { sendFacebookText } from "@/features/facebook/client";
import { createLineClient, pushText } from "@/features/line/client";
import { decryptSecret } from "@/lib/crypto";

export type ManualReplyResult = { ok: true } | { ok: false; reason: string };

/**
 * Send a human agent's reply to the customer on whichever channel this
 * conversation lives on (LINE push / Messenger send), then record it as an
 * outbound message so the thread stays complete. Used by the inbox when an
 * agent takes over from the bot.
 */
export async function sendManualReply(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  text: string,
): Promise<ManualReplyResult> {
  const body = text.trim();
  if (!body) return { ok: false, reason: "empty" };

  const ctx = await getConversationSendContext(db, tenantId, conversationId);
  if (!ctx) return { ok: false, reason: "no_recipient" };

  try {
    if (ctx.channelType === "LINE") {
      const line = await getLineChannelContext(db, ctx.channelId);
      if (!line?.connection) return { ok: false, reason: "no_connection" };
      const token = decryptSecret(line.connection.accessTokenEncrypted);
      await pushText(createLineClient(token), ctx.externalId, body);
    } else if (ctx.channelType === "MESSENGER") {
      const fb = await getFacebookChannelContext(db, ctx.channelId);
      if (!fb?.connection) return { ok: false, reason: "no_connection" };
      const token = decryptSecret(fb.connection.accessTokenEncrypted);
      await sendFacebookText(token, ctx.externalId, body);
    } else {
      return { ok: false, reason: "unsupported_channel" };
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "send_failed",
    };
  }

  await recordOutboundMessage(db, tenantId, conversationId, {
    body,
    category: "TRANSACTIONAL",
  });
  return { ok: true };
}
