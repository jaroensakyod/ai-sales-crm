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
