import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { flexCards } from "@/db/schema";
import type { CarouselItem, FlexButton } from "@/db/tables/flexCards";
import type {
  CustomFlexCard,
  FlexStyle,
  MessageCard,
} from "@/features/messaging/cards";

export type FlexCard = typeof flexCards.$inferSelect;

export async function listFlexCards(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(flexCards)
    .where(eq(flexCards.tenantId, tenantId))
    .orderBy(desc(flexCards.createdAt));
}

export async function getFlexCard(db: DbClient, tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(flexCards)
    .where(and(eq(flexCards.tenantId, tenantId), eq(flexCards.id, id)));
  return row ?? null;
}

/** Split a trigger field into individual keywords (comma- or newline-separated). */
function splitKeywords(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/** First card triggered by the message. Each card may list several keywords
 *  (comma/newline separated); a card matches if ANY keyword matches under its
 *  mode: "exact" = whole message equals the keyword, else substring ("contains").
 *  Used by the chat pipeline to auto-send a merchant card. */
export async function findFlexCardByTrigger(
  db: DbClient,
  tenantId: string,
  text: string,
): Promise<FlexCard | null> {
  const n = text.trim().toLowerCase();
  const rows = await db
    .select()
    .from(flexCards)
    .where(eq(flexCards.tenantId, tenantId))
    .orderBy(desc(flexCards.createdAt));
  for (const row of rows) {
    const keywords = splitKeywords(row.triggerKeyword);
    if (keywords.length === 0) continue;
    const exact = row.triggerMatch === "exact";
    const hit = keywords.some((kw) => (exact ? n === kw : n.includes(kw)));
    if (hit) return row;
  }
  return null;
}

export type FlexCardInput = {
  name: string;
  kind?: string;
  style?: string;
  accentColor?: string | null;
  headline?: string | null;
  body?: string | null;
  priceLabel?: string | null;
  imageUrl?: string | null;
  buttonLabel?: string | null;
  buttonKind?: string;
  buttonValue?: string | null;
  buttons?: FlexButton[] | null;
  items?: CarouselItem[] | null;
  triggerKeyword?: string | null;
  triggerMatch?: string;
};

export async function createFlexCard(
  db: DbClient,
  tenantId: string,
  input: FlexCardInput,
) {
  const [row] = await db
    .insert(flexCards)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

/** Set/clear a card's chat trigger keyword (so existing cards can be made
 *  auto-sendable without recreating them). */
export async function updateFlexCardTrigger(
  db: DbClient,
  tenantId: string,
  id: string,
  triggerKeyword: string | null,
  triggerMatch: string = "contains",
) {
  await db
    .update(flexCards)
    .set({ triggerKeyword, triggerMatch, updatedAt: new Date() })
    .where(and(eq(flexCards.tenantId, tenantId), eq(flexCards.id, id)));
}

/** Edit a saved single card's content (headline/body/price/image/style) so the
 *  merchant can fix a card without deleting and rebuilding it. */
export async function updateFlexCard(
  db: DbClient,
  tenantId: string,
  id: string,
  input: {
    name?: string;
    style?: string;
    accentColor?: string | null;
    headline?: string | null;
    body?: string | null;
    priceLabel?: string | null;
    imageUrl?: string | null;
  },
) {
  await db
    .update(flexCards)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(flexCards.tenantId, tenantId), eq(flexCards.id, id)));
}

export async function deleteFlexCard(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(flexCards)
    .where(and(eq(flexCards.tenantId, tenantId), eq(flexCards.id, id)));
}

function itemToCustomCard(
  item: {
    headline: string;
    body?: string;
    priceLabel?: string;
    imageUrl?: string;
    buttonLabel?: string;
    buttonKind?: string;
    buttonValue?: string;
  },
  style: FlexStyle,
): CustomFlexCard {
  // Old carousels were saved with the full product name as the label, which LINE
  // truncated to a cut-off "สั่งซื้อ Your Life C". Clamp any over-long label back
  // to a clean "สั่งซื้อเลย" so existing cards render tidily too (value is unchanged).
  const label =
    item.buttonLabel && item.buttonLabel.length <= 20 ? item.buttonLabel : "สั่งซื้อเลย";
  const actions =
    item.buttonLabel && item.buttonValue
      ? [
          item.buttonKind === "url"
            ? { label, url: item.buttonValue }
            : { label, text: item.buttonValue },
        ]
      : [];
  return {
    kind: "custom_flex",
    imageUrl: item.imageUrl,
    headline: item.headline,
    body: item.body,
    priceLabel: item.priceLabel,
    style,
    actions,
    fallback: [item.headline, item.priceLabel].filter(Boolean).join(" "),
  };
}

/**
 * Turn a stored card into the channel-agnostic MessageCard both renderers
 * understand — a single bubble, or a carousel of product bubbles.
 */
export function flexCardToMessageCard(card: FlexCard): MessageCard {
  const style = (card.style as FlexStyle) ?? "plain";

  if (card.kind === "carousel") {
    const cards = (card.items ?? []).map((it) => itemToCustomCard(it, style));
    return {
      kind: "carousel",
      cards,
      fallback: cards.map((c) => c.headline).join(" · ") || card.name,
    };
  }

  // Multiple buttons (new) take priority; fall back to the single legacy button.
  const actions =
    card.buttons && card.buttons.length > 0
      ? card.buttons
          .filter((b) => b.label && b.value)
          .map((b) =>
            b.kind === "url"
              ? { label: b.label, url: b.value }
              : { label: b.label, text: b.value },
          )
      : card.buttonLabel && card.buttonValue
        ? [
            card.buttonKind === "url"
              ? { label: card.buttonLabel, url: card.buttonValue }
              : { label: card.buttonLabel, text: card.buttonValue },
          ]
        : [];

  return {
    kind: "custom_flex",
    imageUrl: card.imageUrl,
    headline: card.headline ?? card.name,
    body: card.body ?? undefined,
    priceLabel: card.priceLabel ?? undefined,
    style,
    accentColor: card.accentColor ?? null,
    actions,
    fallback: [card.headline, card.priceLabel].filter(Boolean).join(" "),
  };
}
