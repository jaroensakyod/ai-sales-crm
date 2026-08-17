const GRAPH_API = "https://graph.facebook.com/v21.0";

/** Tappable suggestion chips shown under a reply (mirrors the LINE type). */
export type QuickReply = { label: string; text: string };

/** Send a text message via the Messenger Send API using a page access token. */
export async function sendFacebookText(
  pageAccessToken: string,
  recipientId: string,
  text: string,
  quickReplies?: QuickReply[],
): Promise<void> {
  const message: {
    text: string;
    quick_replies?: { content_type: "text"; title: string; payload: string }[];
  } = { text };
  if (quickReplies && quickReplies.length > 0) {
    message.quick_replies = quickReplies.slice(0, 13).map((q) => ({
      content_type: "text",
      title: q.label.slice(0, 20),
      payload: q.text,
    }));
  }
  const res = await fetch(
    `${GRAPH_API}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Facebook send failed ${res.status}: ${body}`);
  }
}

/**
 * Subscribe the page to this app's webhooks (messages) so inbound Messenger
 * events start flowing — otherwise the merchant has to click "subscribe" in the
 * Meta console. Best-effort: returns false on failure instead of throwing.
 */
export async function subscribePageWebhook(
  pageAccessToken: string,
  pageId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${encodeURIComponent(pageId)}/subscribed_apps`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: "messages,messaging_postbacks",
          access_token: pageAccessToken,
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Send an image (by public URL) via the Messenger Send API, plus an optional
 *  caption as a follow-up text message (Messenger has no image caption field,
 *  so the text is a second message). */
export async function sendFacebookImage(
  pageAccessToken: string,
  recipientId: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_API}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: false },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Facebook image send failed ${res.status}: ${body}`);
  }
  if (caption?.trim()) {
    await sendFacebookText(pageAccessToken, recipientId, caption);
  }
}

/**
 * Download a Messenger CDN image (payment slip) as base64 for OCR. Returns null
 * on failure so slip handling degrades to a plain acknowledgement.
 */
export async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString("base64"), mimeType };
  } catch {
    return null;
  }
}
