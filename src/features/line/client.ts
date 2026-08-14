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
