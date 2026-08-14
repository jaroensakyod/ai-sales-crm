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
