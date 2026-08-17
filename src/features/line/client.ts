import { messagingApi } from "@line/bot-sdk";

/**
 * Build a Messaging API client from an OA's (already decrypted) access token.
 * One client per connection — tokens are per-tenant, never a shared env var.
 */
export function createLineClient(accessToken: string) {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: accessToken,
  });
}

export type LineClient = ReturnType<typeof createLineClient>;

/**
 * Download an inbound message's binary content (image slips, voice notes, …)
 * via the Messaging API's content endpoint, returned as base64. Uses the data
 * host, not the regular API host. Returns null on any failure so callers can
 * degrade gracefully rather than throwing.
 */
export async function fetchLineMessageContent(
  accessToken: string,
  messageId: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(
      `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

/** Tappable suggestion chips shown under a reply. `text` is sent as if the
 *  customer typed it when they tap `label`. */
export type QuickReply = { label: string; text: string };

/** Build a LINE text message, attaching quick-reply chips when provided. */
function lineTextMessage(
  text: string,
  quickReplies?: QuickReply[],
): messagingApi.TextMessage {
  const msg: messagingApi.TextMessage = { type: "text", text };
  if (quickReplies && quickReplies.length > 0) {
    msg.quickReply = {
      items: quickReplies.slice(0, 13).map((q) => ({
        type: "action",
        action: { type: "message", label: q.label.slice(0, 20), text: q.text },
      })),
    };
  }
  return msg;
}

/** Reply to an inbound event using its single-use reply token (free, no quota). */
export async function replyText(
  client: LineClient,
  replyToken: string,
  text: string,
  quickReplies?: QuickReply[],
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [lineTextMessage(text, quickReplies)],
  });
}

/**
 * Reply with a product image (+ optional caption) using the single-use reply
 * token. Image + caption go in ONE replyMessage call because the token can only
 * be spent once. LINE needs HTTPS JPEG/PNG for both the full + preview image.
 */
export async function replyImage(
  client: LineClient,
  replyToken: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const messages: messagingApi.Message[] = [
    { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl },
  ];
  if (caption) messages.push({ type: "text", text: caption });
  await client.replyMessage({ replyToken, messages });
}

/**
 * Broadcast a promo (optional banner image + text) to ALL friends of the OA.
 * Counts toward the monthly quota per recipient (risk #4) — merchant-initiated,
 * gated by a confirm step. Image first, then text, in one broadcast (≤5 msgs).
 */
export async function broadcastPromo(
  client: LineClient,
  input: { text?: string; imageUrl?: string | null },
): Promise<void> {
  const messages: messagingApi.Message[] = [];
  if (input.imageUrl) {
    messages.push({
      type: "image",
      originalContentUrl: input.imageUrl,
      previewImageUrl: input.imageUrl,
    });
  }
  if (input.text) messages.push({ type: "text", text: input.text });
  if (messages.length === 0) return;
  await client.broadcast({ messages });
}

/** Proactively push to a user. Counts toward the monthly quota (risk #4) — only
 *  used by the Follow-up Engine after the 24h-window gate passes (risk #1). */
export async function pushText(
  client: LineClient,
  toUserId: string,
  text: string,
  quickReplies?: QuickReply[],
): Promise<void> {
  await client.pushMessage({
    to: toUserId,
    messages: [lineTextMessage(text, quickReplies)],
  });
}
