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

/** First card whose (non-empty) trigger keyword appears in the message. Used by
 *  the chat pipeline to auto-send a merchant card. Pure substring, case-folded. */
export async function findFlexCardByTrigger(
  db: DbClient,
  tenantId: string,
  text: string,
): Promise<FlexCard | null> {
  const n = text.toLowerCase();
  const rows = await db
    .select()
    .from(flexCards)
    .where(eq(flexCards.tenantId, tenantId))
    .orderBy(desc(flexCards.createdAt));
  for (const row of rows) {
    const kw = row.triggerKeyword?.trim().toLowerCase();
    if (kw && n.includes(kw)) return row;
  }
  return null;
}

export type FlexCardInput = {
  name: string;
  kind?: string;
  style?: string;
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
) {
  await db
    .update(flexCards)
    .set({ triggerKeyword, updatedAt: new Date() })
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
  const actions =
    item.buttonLabel && item.buttonValue
      ? [
          item.buttonKind === "url"
            ? { label: item.buttonLabel, url: item.buttonValue }
            : { label: item.buttonLabel, text: item.buttonValue },
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
    actions,
    fallback: [card.headline, card.priceLabel].filter(Boolean).join(" "),
  };
}
