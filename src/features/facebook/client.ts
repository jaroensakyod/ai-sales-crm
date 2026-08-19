import type { CardAction, MessageCard } from "@/features/messaging/cards";

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

// ── Rich cards (Messenger templates) ─────────────────────────────────────────
// Messenger has no Flex; we use the generic/button templates. Card buttons are
// `postback` type — their payload is the SAME text a quick-reply would send, so
// the webhook's postback handler routes them through the normal pipeline.

type FbPostbackButton = { type: "postback"; title: string; payload: string };
type FbUrlButton = { type: "web_url"; title: string; url: string };
type FbButton = FbPostbackButton | FbUrlButton;

function fbButtons(actions: CardAction[]): FbButton[] {
  return actions
    // Messenger has no clipboard action — drop copy-only buttons (the value is
    // already shown in the card text, which FB users can long-press to copy).
    .filter((a) => !a.copy)
    .slice(0, 3)
    .map((a) =>
      a.url
        ? { type: "web_url", title: a.label.slice(0, 20), url: a.url }
        : { type: "postback", title: a.label.slice(0, 20), payload: a.text ?? a.label },
    );
}

/** One Messenger generic-template element from a custom card. */
function fbElement(card: Extract<MessageCard, { kind: "custom_flex" }>) {
  const subtitle = [card.body, card.priceLabel].filter(Boolean).join(" • ");
  return {
    title: card.headline.slice(0, 80),
    ...(card.imageUrl ? { image_url: card.imageUrl } : {}),
    subtitle: subtitle.slice(0, 80),
    buttons: fbButtons(card.actions),
  };
}

export function fbCardAttachment(card: MessageCard) {
  if (card.kind === "carousel") {
    // Messenger generic template shows up to 10 swipeable cards.
    return {
      type: "template",
      payload: {
        template_type: "generic",
        elements: card.cards.slice(0, 10).map(fbElement),
      },
    };
  }
  if (card.kind === "order_confirm") {
    if (card.imageUrl) {
      return {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: card.productName.slice(0, 80),
              image_url: card.imageUrl,
              subtitle: card.detail.slice(0, 80),
              buttons: fbButtons(card.actions),
            },
          ],
        },
      };
    }
    return {
      type: "template",
      payload: {
        template_type: "button",
        text: `${card.title}\n${card.productName}\n${card.detail}`.slice(0, 640),
        buttons: fbButtons(card.actions),
      },
    };
  }
  if (card.kind === "custom_flex") {
    const subtitle = [card.body, card.priceLabel].filter(Boolean).join(" • ");
    if (card.imageUrl) {
      return {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: card.headline.slice(0, 80),
              image_url: card.imageUrl,
              subtitle: subtitle.slice(0, 80),
              buttons: fbButtons(card.actions),
            },
          ],
        },
      };
    }
    return {
      type: "template",
      payload: {
        template_type: "button",
        text: `${card.headline}${subtitle ? `\n${subtitle}` : ""}`.slice(0, 640),
        buttons: fbButtons(
          card.actions.length
            ? card.actions
            : [{ label: "ดูรายละเอียด", text: "สนใจ" }],
        ),
      },
    };
  }

  // Payment: button template holds the full instruction (≤640) + a contact button.
  const lines = [card.amountLabel, ...card.rows.map((r) => `${r.label}: ${r.value}`)];
  if (card.note) lines.push(card.note);
  return {
    type: "template",
    payload: {
      template_type: "button",
      text: `${card.title}\n${lines.join("\n")}`.slice(0, 640),
      buttons: fbButtons(card.actions ?? [{ label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" }]),
    },
  };
}

/** Send a rich card as a Messenger template. Falls back to the card's plain-text
 *  fallback if the template call fails, so the customer is never left on read. */
export async function sendFacebookCard(
  pageAccessToken: string,
  recipientId: string,
  card: MessageCard,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_API}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { attachment: fbCardAttachment(card) },
      }),
    },
  );
  if (!res.ok) {
    // Template rejected (bad image URL, etc.) — degrade to text so the customer
    // still gets the order/payment details.
    await sendFacebookText(pageAccessToken, recipientId, card.fallback);
  }
}

/**
 * Fetch a messaging user's public profile (name + avatar) so the CRM shows a
 * real name instead of "(ไม่ระบุชื่อ)". Works for both Messenger (PSID →
 * first/last name) and Instagram (IGSID → name/username) since all the fields
 * are requested together. Returns null on failure (stays unnamed, never throws).
 */
export async function fetchFacebookProfile(
  pageAccessToken: string,
  userId: string,
): Promise<{ displayName?: string; avatarUrl?: string } | null> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${encodeURIComponent(userId)}?fields=name,first_name,last_name,username,profile_pic&access_token=${encodeURIComponent(pageAccessToken)}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      name?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
      profile_pic?: string;
    };
    const displayName =
      j.name ||
      [j.first_name, j.last_name].filter(Boolean).join(" ") ||
      j.username ||
      undefined;
    return { displayName: displayName || undefined, avatarUrl: j.profile_pic };
  } catch {
    return null;
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
