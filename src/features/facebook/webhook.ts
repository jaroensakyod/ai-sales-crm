import type { DbClient } from "@/db/client";
import {
  getFacebookChannelByPageId,
  getFacebookChannelContext,
} from "@/db/repositories/facebook";
import { decryptSecret } from "@/lib/crypto";
import {
  handleInboundImage,
  handleInboundText,
  type SendFn,
  type SendImageFn,
} from "@/features/messaging/pipeline";
import type { SendCardFn } from "@/features/messaging/cards";
import { transcribeVoice } from "@/features/messaging/voice";
import type { RouterHandlers } from "@/features/router/types";

import {
  fetchImageAsBase64,
  sendFacebookCard,
  sendFacebookImage,
  sendFacebookText,
} from "./client";
import { verifyFacebookSignature } from "./signature";

type FbAttachment = { type?: string; payload?: { url?: string } };
type FbMessaging = {
  sender?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: FbAttachment[];
  };
  /** A card button tap (template postback). payload carries the same text a
   *  quick-reply would, so we route it through the normal text pipeline. */
  postback?: { payload?: string; mid?: string };
};
type FbEntry = { id?: string; messaging?: FbMessaging[] };

export type FbProcessDeps = {
  routerHandlers?: RouterHandlers;
  /** Override the send transport (tests inject a spy instead of the Graph API). */
  send?: SendFn;
  /** Override the image transport (tests inject a spy). */
  sendImage?: SendImageFn;
  /** Override the card transport (tests inject a spy). */
  sendCard?: SendCardFn;
};

export type FbWebhookResult =
  | { ok: false; status: 400 | 401 | 404 | 409 | 500; error: string }
  | { ok: true; status: 200; processed: number; skipped: number; replied: number };

type Counts = { processed: number; skipped: number; replied: number };
type FbTarget = {
  tenantId: string;
  channelId: string;
  accessTokenEncrypted: string;
};

/** App-secret signature check + JSON parse shared by both entry points. */
function verifyAndParse(
  rawBody: string,
  signature: string | null | undefined,
):
  | { ok: true; entries: FbEntry[] }
  | { ok: false; result: FbWebhookResult } {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return {
      ok: false,
      result: { ok: false, status: 500, error: "META_APP_SECRET not configured" },
    };
  }
  if (!verifyFacebookSignature(appSecret, rawBody, signature)) {
    return {
      ok: false,
      result: { ok: false, status: 401, error: "invalid signature" },
    };
  }
  try {
    const payload = JSON.parse(rawBody) as { entry?: FbEntry[] };
    return { ok: true, entries: payload.entry ?? [] };
  } catch {
    return {
      ok: false,
      result: { ok: false, status: 400, error: "invalid json" },
    };
  }
}

/** Run one page's messaging events through the shared pipeline. Replies go to the
 *  sender PSID via the Send API using that page's decrypted token. */
async function runMessagings(
  db: DbClient,
  target: FbTarget,
  messagings: FbMessaging[],
  deps: FbProcessDeps,
): Promise<Counts> {
  // Build the transports lazily (and once) from this page's token unless a test
  // injected a spy. Per-page so a multi-page batch uses the right token each time.
  let send = deps.send;
  let sendImage = deps.sendImage;
  const getSend = (): SendFn => {
    if (!send) {
      const token = decryptSecret(target.accessTokenEncrypted);
      send = (psid, text, quickReplies) =>
        sendFacebookText(token, psid, text, quickReplies);
    }
    return send;
  };
  const getSendImage = (): SendImageFn => {
    if (!sendImage) {
      const token = decryptSecret(target.accessTokenEncrypted);
      sendImage = (psid, imageUrl, caption) =>
        sendFacebookImage(token, psid, imageUrl, caption);
    }
    return sendImage;
  };
  let sendCard = deps.sendCard;
  const getSendCard = (): SendCardFn => {
    if (!sendCard) {
      const token = decryptSecret(target.accessTokenEncrypted);
      sendCard = (psid, card) => sendFacebookCard(token, psid, card);
    }
    return sendCard;
  };

  const counts: Counts = { processed: 0, skipped: 0, replied: 0 };
  for (const m of messagings) {
    const psid = m.sender?.id;

    // Card button tap (postback) — route its payload as if the customer typed it.
    // Postbacks carry no message.mid; synthesize a dedup id from psid+timestamp.
    const postbackPayload = m.postback?.payload;
    if (postbackPayload && psid) {
      const pbId = m.postback?.mid ?? `pb:${psid}:${m.timestamp ?? ""}`;
      const r = await handleInboundText(db, {
        tenantId: target.tenantId,
        channelId: target.channelId,
        externalId: psid,
        text: postbackPayload,
        channelMessageId: pbId,
        at: m.timestamp ? new Date(m.timestamp) : undefined,
        routerHandlers: deps.routerHandlers,
        send: getSend(),
        sendImage: getSendImage(),
        sendCard: getSendCard(),
      });
      if (r.status === "duplicate") counts.skipped++;
      else {
        counts.processed++;
        if (r.replied) counts.replied++;
      }
      continue;
    }

    const text = m.message?.text;
    const image = m.message?.attachments?.find((a) => a.type === "image");
    const audioUrl = m.message?.attachments?.find((a) => a.type === "audio")
      ?.payload?.url;
    // Require mid for dedup: without it, redelivered events would re-process
    // (NULL channelMessageId never matches the unique index).
    if (
      !psid ||
      !m.message?.mid ||
      m.message?.is_echo ||
      (!text && !image && !audioUrl)
    ) {
      counts.skipped++;
      continue;
    }
    const at = m.timestamp ? new Date(m.timestamp) : undefined;
    const mid = m.message.mid;

    // Voice message — transcribe, then run the transcript through the text
    // pipeline (like LINE). Fires only when there's no text/image.
    if (!text && !image && audioUrl) {
      const media = await fetchImageAsBase64(audioUrl);
      const transcript = media ? await transcribeVoice(media) : null;
      if (!transcript) {
        await getSend()(
          psid,
          "ขอโทษค่ะ ฟังข้อความเสียงไม่ชัด รบกวนพิมพ์ข้อความมาได้ไหมคะ",
        );
        counts.processed++;
        counts.replied++;
        continue;
      }
      const r = await handleInboundText(db, {
        tenantId: target.tenantId,
        channelId: target.channelId,
        externalId: psid,
        text: transcript,
        channelMessageId: mid,
        at,
        routerHandlers: deps.routerHandlers,
        send: getSend(),
        sendImage: getSendImage(),
        sendCard: getSendCard(),
      });
      if (r.status === "duplicate") counts.skipped++;
      else {
        counts.processed++;
        if (r.replied) counts.replied++;
      }
      continue;
    }

    // Image (usually a payment slip) — Messenger gives a public CDN URL that we
    // download for OCR.
    const slipUrl = image?.payload?.url;
    const result =
      !text && image
        ? await handleInboundImage(db, {
            tenantId: target.tenantId,
            channelId: target.channelId,
            externalId: psid,
            channelMessageId: mid,
            slipUrl,
            at,
            send: getSend(),
            loadImage: slipUrl ? () => fetchImageAsBase64(slipUrl) : undefined,
          })
        : await handleInboundText(db, {
            tenantId: target.tenantId,
            channelId: target.channelId,
            externalId: psid,
            text: text ?? "",
            channelMessageId: mid,
            at,
            routerHandlers: deps.routerHandlers,
            send: getSend(),
            sendImage: getSendImage(),
            sendCard: getSendCard(),
          });

    if (result.status === "duplicate") {
      counts.skipped++;
      continue;
    }
    counts.processed++;
    if (result.replied) counts.replied++;
  }
  return counts;
}

/**
 * Per-channel webhook (one Meta app per page — the URL carries the channelId).
 * Kept for backward compatibility; new tenants use the single-app route below.
 */
export async function processFacebookWebhook(
  db: DbClient,
  channelId: string,
  rawBody: string,
  signature: string | null | undefined,
  deps: FbProcessDeps = {},
): Promise<FbWebhookResult> {
  const parsed = verifyAndParse(rawBody, signature);
  if (!parsed.ok) return parsed.result;

  const context = await getFacebookChannelContext(db, channelId);
  if (!context) return { ok: false, status: 404, error: "unknown channel" };
  if (!context.connection) {
    return { ok: false, status: 409, error: "channel not connected" };
  }

  const target: FbTarget = {
    tenantId: context.channel.tenantId,
    channelId,
    accessTokenEncrypted: context.connection.accessTokenEncrypted,
  };
  const totals: Counts = { processed: 0, skipped: 0, replied: 0 };
  for (const entry of parsed.entries) {
    const c = await runMessagings(db, target, entry.messaging ?? [], deps);
    totals.processed += c.processed;
    totals.skipped += c.skipped;
    totals.replied += c.replied;
  }
  return { ok: true, status: 200, ...totals };
}

/**
 * Single-app webhook (the production model): one Meta app receives every
 * connected page's events on one URL, dispatched by page id (`entry[].id`).
 * One shared app secret verifies all. Unknown/unconnected pages are skipped
 * (still 200 so Meta doesn't retry).
 */
export async function processFacebookWebhookByPage(
  db: DbClient,
  rawBody: string,
  signature: string | null | undefined,
  deps: FbProcessDeps = {},
): Promise<FbWebhookResult> {
  const parsed = verifyAndParse(rawBody, signature);
  if (!parsed.ok) return parsed.result;

  const totals: Counts = { processed: 0, skipped: 0, replied: 0 };
  for (const entry of parsed.entries) {
    const pageId = entry.id;
    if (!pageId) continue;
    const context = await getFacebookChannelByPageId(db, pageId);
    if (!context?.connection) continue; // page not connected here — ignore
    const target: FbTarget = {
      tenantId: context.channel.tenantId,
      channelId: context.channel.id,
      accessTokenEncrypted: context.connection.accessTokenEncrypted,
    };
    const c = await runMessagings(db, target, entry.messaging ?? [], deps);
    totals.processed += c.processed;
    totals.skipped += c.skipped;
    totals.replied += c.replied;
  }
  return { ok: true, status: 200, ...totals };
}
