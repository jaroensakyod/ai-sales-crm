import { messagingApi } from "@line/bot-sdk";

import type { CardAction, MessageCard } from "@/features/messaging/cards";

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
 * Fetch a LINE user's public profile (display name + avatar) so the CRM can
 * show a real name instead of "(unnamed)". LINE webhook events don't include
 * the name, so we call the profile endpoint. Returns null on failure.
 */
export async function fetchLineProfile(
  accessToken: string,
  userId: string,
): Promise<{ displayName?: string; avatarUrl?: string } | null> {
  try {
    const profile = await createLineClient(accessToken).getProfile(userId);
    return { displayName: profile.displayName, avatarUrl: profile.pictureUrl };
  } catch {
    return null;
  }
}

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

/** LINE accepts at most 5 message objects per reply/push call. */
const LINE_MAX_MESSAGES = 5;
/** Soft size per bubble — long AI answers get split so LINE doesn't render one
 *  giant wall of text (which the app visually clips). Short replies (payment
 *  instruction, greetings) stay a single bubble because they fit under this. */
const BUBBLE_SOFT_LIMIT = 900;

/** Split one long line that has no blank-line breaks, preferring single newlines
 *  then hard-slicing (Thai has no spaces to break on). */
function hardSplit(s: string, limit: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of s.split("\n")) {
    if (line.length > limit) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      for (let i = 0; i < line.length; i += limit) out.push(line.slice(i, i + limit));
      continue;
    }
    if (cur && cur.length + 1 + line.length > limit) {
      out.push(cur);
      cur = line;
    } else {
      cur = cur ? `${cur}\n${line}` : line;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Break a reply into LINE bubbles: split on blank lines (paragraphs), greedily
 * pack paragraphs up to a soft size, and never exceed 5 bubbles (overflow is
 * merged into the last). Short replies come back as a single-element array.
 * Exported for testing.
 */
export function splitMessageForLine(
  text: string,
  opts?: { maxBubbles?: number; softLimit?: number },
): string[] {
  const maxBubbles = opts?.maxBubbles ?? LINE_MAX_MESSAGES;
  const softLimit = opts?.softLimit ?? BUBBLE_SOFT_LIMIT;
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bubbles: string[] = [];
  for (const para of paragraphs) {
    const chunks = para.length <= softLimit ? [para] : hardSplit(para, softLimit);
    for (const chunk of chunks) {
      const last = bubbles[bubbles.length - 1];
      // Keep separate paragraphs together in one bubble while they still fit.
      if (last && last.length + 2 + chunk.length <= softLimit) {
        bubbles[bubbles.length - 1] = `${last}\n\n${chunk}`;
      } else {
        bubbles.push(chunk);
      }
    }
  }

  if (bubbles.length > maxBubbles) {
    const head = bubbles.slice(0, maxBubbles - 1);
    const tail = bubbles.slice(maxBubbles - 1).join("\n\n");
    return [...head, tail];
  }
  return bubbles;
}

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

/** Turn a reply into 1–5 LINE text messages, attaching the quick-reply chips to
 *  the LAST bubble only (so they sit under the final message). */
function lineTextMessages(
  text: string,
  quickReplies?: QuickReply[],
): messagingApi.TextMessage[] {
  const parts = splitMessageForLine(text);
  const bubbles = parts.length ? parts : [text];
  return bubbles.map((t, i) =>
    lineTextMessage(t, i === bubbles.length - 1 ? quickReplies : undefined),
  );
}

/** Reply to an inbound event using its single-use reply token (free, no quota).
 *  A long answer is split into multiple bubbles in this one call (≤5). */
export async function replyText(
  client: LineClient,
  replyToken: string,
  text: string,
  quickReplies?: QuickReply[],
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: lineTextMessages(text, quickReplies),
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

/**
 * Rich Message broadcast: a big banner image where tapping anywhere opens a link
 * (LINE "rich message" / clickable image). Implemented as a Flex bubble with a
 * full-width hero image carrying a URI action — this needs no multi-resolution
 * imagemap hosting, and the whole image is one clickable link. An optional text
 * message is sent after it.
 */
export async function broadcastRichImage(
  client: LineClient,
  input: { imageUrl: string; linkUrl: string; text?: string },
): Promise<void> {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    hero: {
      type: "image",
      url: input.imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
      action: { type: "uri", label: "เปิดลิงก์", uri: input.linkUrl },
    },
  };
  const messages: messagingApi.Message[] = [
    { type: "flex", altText: input.text?.slice(0, 400) || "โปรโมชั่น", contents: bubble },
  ];
  if (input.text) messages.push({ type: "text", text: input.text });
  await client.broadcast({ messages });
}

// ── Flex cards ──────────────────────────────────────────────────────────────

function flexButtons(
  actions: CardAction[],
  firstPrimary: boolean,
): messagingApi.FlexComponent[] {
  return actions.map((a, i) => ({
    type: "button",
    style: firstPrimary && i === 0 ? "primary" : "secondary",
    height: "sm",
    action: a.copy
      ? { type: "clipboard", label: a.label.slice(0, 20), clipboardText: a.copy }
      : a.url
        ? { type: "uri", label: a.label.slice(0, 20), uri: a.url }
        : { type: "message", label: a.label.slice(0, 20), text: a.text ?? a.label },
  }));
}

function orderBubble(card: Extract<MessageCard, { kind: "order_confirm" }>) {
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: card.title, weight: "bold", size: "lg" },
        { type: "text", text: card.productName, size: "md", wrap: true },
        {
          type: "text",
          text: card.detail,
          size: "sm",
          color: "#888888",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: flexButtons(card.actions, true),
    },
  };
  if (card.imageUrl) {
    bubble.hero = {
      type: "image",
      url: card.imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }
  return bubble;
}

function paymentBubble(card: Extract<MessageCard, { kind: "payment" }>) {
  const rows: messagingApi.FlexComponent[] = card.rows.map((r) => ({
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: r.label, size: "sm", color: "#888888", flex: 2 },
      {
        type: "text",
        text: r.value,
        size: "sm",
        weight: "bold",
        align: "end",
        wrap: true,
        flex: 4,
      },
    ],
  }));
  const body: messagingApi.FlexComponent[] = [
    { type: "text", text: card.title, weight: "bold", size: "lg" },
    {
      type: "text",
      text: card.amountLabel,
      weight: "bold",
      size: "md",
      color: "#1DB446",
    },
    { type: "separator", margin: "md" },
    ...rows,
  ];
  if (card.note) {
    body.push({
      type: "text",
      text: card.note,
      size: "xs",
      color: "#888888",
      wrap: true,
      margin: "md",
    });
  }
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
  };
  if (card.actions?.length) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: flexButtons(card.actions, false),
    };
  }
  return bubble;
}

/** Per-style colors for a custom card. */
function styleColors(style: string | undefined) {
  switch (style) {
    case "promo":
      return { accent: "#D85A30", price: "#D85A30", header: "โปรพิเศษ 🔥" };
    case "minimal":
      return { accent: "#444444", price: "#444444", header: null };
    default:
      return { accent: "#185FA5", price: "#1DB446", header: null };
  }
}

function customBubble(card: Extract<MessageCard, { kind: "custom_flex" }>) {
  const base = styleColors(card.style);
  // A custom accent colour (if set) overrides the preset's accent + price.
  const colors = card.accentColor
    ? { ...base, accent: card.accentColor, price: card.accentColor }
    : base;
  const body: messagingApi.FlexComponent[] = [
    { type: "text", text: card.headline, weight: "bold", size: "lg", wrap: true },
  ];
  if (card.body) {
    body.push({
      type: "text",
      text: card.body,
      size: "sm",
      color: "#666666",
      wrap: true,
    });
  }
  if (card.priceLabel) {
    body.push({
      type: "text",
      text: card.priceLabel,
      weight: "bold",
      size: "md",
      color: colors.price,
      margin: "md",
    });
  }
  const bubble: messagingApi.FlexBubble = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
  };
  // "promo" style adds a coloured ribbon header.
  if (colors.header) {
    bubble.header = {
      type: "box",
      layout: "vertical",
      backgroundColor: colors.accent,
      paddingAll: "10px",
      contents: [
        {
          type: "text",
          text: colors.header,
          color: "#ffffff",
          weight: "bold",
          size: "sm",
        },
      ],
    };
  }
  if (card.imageUrl) {
    bubble.hero = {
      type: "image",
      url: card.imageUrl,
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }
  if (card.actions.length) {
    // "minimal" uses outline (secondary) buttons; others a coloured primary.
    const buttons = flexButtons(card.actions, card.style !== "minimal").map(
      (b) =>
        card.style === "minimal"
          ? b
          : { ...b, color: colors.accent },
    );
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons,
    };
  }
  return bubble;
}

/** Turn a channel-agnostic card into a LINE Flex message. altText (shown in
 *  notifications / unsupported clients) reuses the card's plain-text fallback. */
export function buildFlexMessage(card: MessageCard): messagingApi.FlexMessage {
  let contents: messagingApi.FlexContainer;
  if (card.kind === "order_confirm") contents = orderBubble(card);
  else if (card.kind === "payment") contents = paymentBubble(card);
  else if (card.kind === "carousel") {
    contents = {
      type: "carousel",
      contents: card.cards.slice(0, 12).map(customBubble),
    };
  } else contents = customBubble(card);
  return {
    type: "flex",
    altText: card.fallback.slice(0, 400),
    contents,
  };
}

/** Reply with a Flex card using the single-use reply token. */
export async function replyFlex(
  client: LineClient,
  replyToken: string,
  card: MessageCard,
): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [buildFlexMessage(card)],
  });
}

/** Push a Flex card (counts toward quota, like any push). */
export async function pushFlex(
  client: LineClient,
  toUserId: string,
  card: MessageCard,
): Promise<void> {
  await client.pushMessage({
    to: toUserId,
    messages: [buildFlexMessage(card)],
  });
}

/** Push an image (+ optional caption) to a user (counts toward quota). Used to
 *  deliver a follow-up image when the single-use reply token is already spent. */
export async function pushImage(
  client: LineClient,
  toUserId: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  const messages: messagingApi.Message[] = [
    { type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl },
  ];
  if (caption) messages.push({ type: "text", text: caption });
  await client.pushMessage({ to: toUserId, messages });
}

/** Broadcast a merchant-designed Flex card to ALL friends of the OA. Counts
 *  toward the monthly quota per recipient (risk #4) — merchant-initiated, gated
 *  by a confirm step in the dashboard. */
export async function broadcastFlex(
  client: LineClient,
  card: MessageCard,
): Promise<void> {
  await client.broadcast({ messages: [buildFlexMessage(card)] });
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
    messages: lineTextMessages(text, quickReplies),
  });
}
