import type { DbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { getLineChannelContext } from "@/db/repositories/line";
import { decryptSecret } from "@/lib/crypto";
import {
  handleInboundImage,
  handleInboundText,
  type SendFn,
  type SendImageFn,
  type QuickReply,
} from "@/features/messaging/pipeline";
import type { MessageCard, SendCardFn } from "@/features/messaging/cards";
import { transcribeVoice } from "@/features/messaging/voice";
import type { RouterHandlers } from "@/features/router/types";

import {
  createLineClient,
  fetchLineMessageContent,
  fetchLineProfile,
  replyFlex,
  replyImage,
  replyText,
} from "./client";
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

export type LineReplyFn = (
  replyToken: string,
  text: string,
  quickReplies?: QuickReply[],
) => Promise<void>;
export type LineReplyImageFn = (
  replyToken: string,
  imageUrl: string,
  caption?: string,
) => Promise<void>;
export type LineReplyCardFn = (
  replyToken: string,
  card: MessageCard,
) => Promise<void>;

export type ProcessDeps = {
  /** Level 2/3 handlers for the router (RAG, Gemini). */
  routerHandlers?: RouterHandlers;
  /** Override the reply transport (tests inject a spy instead of hitting LINE). */
  reply?: LineReplyFn;
  /** Override the image transport (tests inject a spy). */
  replyImage?: LineReplyImageFn;
  /** Override the Flex-card transport (tests inject a spy). */
  replyCard?: LineReplyCardFn;
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
      reply = (replyToken, text, quickReplies) =>
        replyText(client, replyToken, text, quickReplies);
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
  let replyCard = deps.replyCard;
  const getReplyCard = (): LineReplyCardFn => {
    if (!replyCard) {
      const client = ensureClient();
      replyCard = (replyToken, card) => replyFlex(client, replyToken, card);
    }
    return replyCard;
  };

  const tenantId = context.channel.tenantId;
  const events = payload.events ?? [];
  let processed = 0;
  let skipped = 0;
  let replied = 0;

  // LINE events carry no display name — fetch it lazily (cached per request) so
  // the CRM shows real names instead of "(unnamed)".
  const profileCache = new Map<
    string,
    { displayName?: string; avatarUrl?: string } | undefined
  >();
  const getProfile = async (uid: string) => {
    if (profileCache.has(uid)) return profileCache.get(uid);
    const token = decryptSecret(context.connection!.accessTokenEncrypted);
    const p = (await fetchLineProfile(token, uid)) ?? undefined;
    profileCache.set(uid, p);
    return p;
  };

  for (const event of events) {
    const userId = event.source?.userId;

    // New friend added the OA → greet immediately with a big welcome Flex card
    // (built from the shop's welcome image + message). This fires on the LINE
    // "follow" event, before any message — no need for the customer to say "สวัสดี".
    if (event.type === "follow" && userId && event.replyToken) {
      const s = await getTenantAiSettings(db, tenantId);
      const welcomeText = s?.welcomeMessage?.trim();
      if (welcomeText || s?.welcomeImageUrl) {
        const card: MessageCard = {
          kind: "custom_flex",
          imageUrl: s?.welcomeImageUrl ?? null,
          headline: "ยินดีต้อนรับค่ะ 🎉",
          body: welcomeText || undefined,
          style: "promo",
          actions: [],
          fallback: welcomeText || "ยินดีต้อนรับค่ะ 🎉",
        };
        await getReplyCard()(event.replyToken, card);
        processed++;
        replied++;
      } else {
        skipped++;
      }
      continue;
    }

    const fromUser = event.type === "message" && event.source?.type === "user";
    const isText = fromUser && event.message?.type === "text";
    const isImage = fromUser && event.message?.type === "image";
    const isAudio = fromUser && event.message?.type === "audio";
    if ((!isText && !isImage && !isAudio) || !userId || !event.message?.id) {
      skipped++;
      continue;
    }

    // LINE replies via the event's single-use token, not the user id.
    const replyToken = event.replyToken;
    const send: SendFn | undefined = replyToken
      ? (_to, text, quickReplies) => getReply()(replyToken, text, quickReplies)
      : undefined;
    const sendImage: SendImageFn | undefined = replyToken
      ? (_to, imageUrl, caption) => getReplyImage()(replyToken, imageUrl, caption)
      : undefined;
    const sendCard: SendCardFn | undefined = replyToken
      ? (_to, card) => getReplyCard()(replyToken, card)
      : undefined;
    const at = event.timestamp ? new Date(event.timestamp) : undefined;

    // Image (usually a payment slip) — acknowledge + OCR + log for review.
    if (isImage) {
      const messageId = event.message.id;
      const result = await handleInboundImage(db, {
        tenantId,
        channelId,
        externalId: userId,
        channelMessageId: messageId,
        at,
        send,
        profile: await getProfile(userId),
        loadImage: () =>
          fetchLineMessageContent(
            decryptSecret(context.connection!.accessTokenEncrypted),
            messageId,
          ),
      });
      if (result.status === "duplicate") {
        skipped++;
        continue;
      }
      processed++;
      if (result.replied) replied++;
      continue;
    }

    // Voice message — transcribe it, then run the transcript through the normal
    // text pipeline so the bot can answer (and the agent sees it in the inbox).
    if (isAudio) {
      const messageId = event.message.id;
      const media = await fetchLineMessageContent(
        decryptSecret(context.connection!.accessTokenEncrypted),
        messageId,
      );
      const transcript = media ? await transcribeVoice(media) : null;
      if (!transcript) {
        if (send) {
          await send(
            userId,
            "ขอโทษค่ะ ฟังข้อความเสียงไม่ชัด รบกวนพิมพ์ข้อความมาได้ไหมคะ",
          );
          replied++;
        }
        processed++;
        continue;
      }
      const result = await handleInboundText(db, {
        tenantId,
        channelId,
        externalId: userId,
        text: transcript,
        channelMessageId: messageId,
        at,
        profile: await getProfile(userId),
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
      continue;
    }

    const result = await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: userId,
      text: event.message.text ?? "",
      channelMessageId: event.message.id,
      at,
      profile: await getProfile(userId),
      routerHandlers: deps.routerHandlers,
      send,
      sendImage,
      sendCard,
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
