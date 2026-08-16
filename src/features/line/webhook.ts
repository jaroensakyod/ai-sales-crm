import type { DbClient } from "@/db/client";
import { getLineChannelContext } from "@/db/repositories/line";
import { decryptSecret } from "@/lib/crypto";
import {
  handleInboundImage,
  handleInboundText,
  type SendFn,
  type SendImageFn,
} from "@/features/messaging/pipeline";
import type { RouterHandlers } from "@/features/router/types";

import { createLineClient, replyImage, replyText } from "./client";
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
export type LineReplyImageFn = (
  replyToken: string,
  imageUrl: string,
  caption?: string,
) => Promise<void>;

export type ProcessDeps = {
  /** Level 2/3 handlers for the router (RAG, Gemini). */
  routerHandlers?: RouterHandlers;
  /** Override the reply transport (tests inject a spy instead of hitting LINE). */
  reply?: LineReplyFn;
  /** Override the image transport (tests inject a spy). */
  replyImage?: LineReplyImageFn;
};

export type LineWebhookResult =
  | { ok: false; status: 400 | 401 | 404 | 409; error: string }
  | { ok: true; status: 200; processed: number; skipped: number; replied: number };

/** Verify signature, then run each text message through the shared pipeline. */
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
  let replyImg = deps.replyImage;
  const ensureClient = () => {
    const token = decryptSecret(context.connection!.accessTokenEncrypted);
    return createLineClient(token);
  };
  const getReply = (): LineReplyFn => {
    if (!reply) {
      const client = ensureClient();
      reply = (replyToken, text) => replyText(client, replyToken, text);
    }
    return reply;
  };
  const getReplyImage = (): LineReplyImageFn => {
    if (!replyImg) {
      const client = ensureClient();
      replyImg = (replyToken, imageUrl, caption) =>
        replyImage(client, replyToken, imageUrl, caption);
    }
    return replyImg;
  };

  const tenantId = context.channel.tenantId;
  const events = payload.events ?? [];
  let processed = 0;
  let skipped = 0;
  let replied = 0;

  for (const event of events) {
    const userId = event.source?.userId;
    const fromUser = event.type === "message" && event.source?.type === "user";
    const isText = fromUser && event.message?.type === "text";
    const isImage = fromUser && event.message?.type === "image";
    if ((!isText && !isImage) || !userId || !event.message?.id) {
      skipped++;
      continue;
    }

    // LINE replies via the event's single-use token, not the user id.
    const replyToken = event.replyToken;
    const send: SendFn | undefined = replyToken
      ? (_to, text) => getReply()(replyToken, text)
      : undefined;
    const sendImage: SendImageFn | undefined = replyToken
      ? (_to, imageUrl, caption) => getReplyImage()(replyToken, imageUrl, caption)
      : undefined;
    const at = event.timestamp ? new Date(event.timestamp) : undefined;

    // Image (usually a payment slip) — acknowledge + log for merchant review.
    if (isImage) {
      const result = await handleInboundImage(db, {
        tenantId,
        channelId,
        externalId: userId,
        channelMessageId: event.message.id,
        at,
        send,
      });
      if (result.status === "duplicate") {
        skipped++;
        continue;
      }
      processed++;
      if (result.replied) replied++;
      continue;
    }

    const result = await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: userId,
      text: event.message.text ?? "",
      channelMessageId: event.message.id,
      at,
      routerHandlers: deps.routerHandlers,
      send,
      sendImage,
    });

    if (result.status === "duplicate") {
      skipped++;
      continue;
    }
    processed++;
    if (result.replied) replied++;
  }

  return { ok: true, status: 200, processed, skipped, replied };
}
