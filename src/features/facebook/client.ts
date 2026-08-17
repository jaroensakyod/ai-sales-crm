const GRAPH_API = "https://graph.facebook.com/v21.0";

/** Send a text message via the Messenger Send API using a page access token. */
export async function sendFacebookText(
  pageAccessToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_API}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
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

/** Send an image (by public URL) via the Messenger Send API. */
export async function sendFacebookImage(
  pageAccessToken: string,
  recipientId: string,
  imageUrl: string,
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
