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
 * Download an inbound image's bytes (payment slips) via the Messaging API's
 * content endpoint, returned as base64 for OCR. Uses the data host, not the
 * regular API host. Returns null on any failure so slip handling degrades to a
 * plain acknowledgement rather than throwing.
 */
export async function fetchLineImage(
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

/** Reply to an inbound event using its single-use reply token (free, no quota). */
export async function replyText(
  client: LineClient,
  replyToken: string,
  text: string,
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
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
): Promise<void> {
  await client.pushMessage({
    to: toUserId,
    messages: [{ type: "text", text }],
  });
}
