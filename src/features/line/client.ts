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

/** Broadcast a text message to ALL friends of the OA. Counts toward the monthly
 *  quota per recipient (risk #4) — merchant-initiated, gated by a confirm step. */
export async function broadcastText(
  client: LineClient,
  text: string,
): Promise<void> {
  await client.broadcast({ messages: [{ type: "text", text }] });
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
