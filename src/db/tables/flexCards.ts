import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** A tappable button on a flex card. kind: "message" sends `value` as a chat
 *  message; "url" opens it. */
export type FlexButton = { label: string; kind: string; value: string };

/** One bubble inside a carousel card. */
export type CarouselItem = {
  headline: string;
  body?: string;
  priceLabel?: string;
  imageUrl?: string;
  buttonLabel?: string;
  buttonKind?: string;
  buttonValue?: string;
};

/**
 * Merchant-designed LINE Flex / Messenger cards, built in the dashboard composer.
 * Stored as plain fields (not raw Flex JSON) so the same card renders on both
 * LINE (Flex) and Facebook (template) via the shared card renderers, and so the
 * merchant edits simple fields instead of hand-writing JSON.
 */
export const flexCards = pgTable(
  "flex_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(), // internal label in the dashboard list
    // "single" = one bubble (fields below); "carousel" = many bubbles (items).
    kind: text("kind").notNull().default("single"),
    // Visual preset: "plain" | "promo" | "minimal" — changes colors/header.
    style: text("style").notNull().default("plain"),
    // Optional custom accent colour (hex) — overrides the preset's accent/price.
    accentColor: text("accent_color"),
    headline: text("headline"),
    body: text("body"),
    priceLabel: text("price_label"),
    imageUrl: text("image_url"),
    buttonLabel: text("button_label"),
    // Legacy single button (kept for old cards). New cards use `buttons` (array).
    // "message" → button sends buttonValue as a chat message; "url" → opens it.
    buttonKind: text("button_kind").notNull().default("message"),
    buttonValue: text("button_value"),
    // Multiple buttons per card (e.g. สั่งซื้อ + รายละเอียด). Falls back to the
    // single buttonLabel/Value above when empty.
    buttons: jsonb("buttons").$type<FlexButton[]>(),
    items: jsonb("items").$type<CarouselItem[]>(),
    // Keyword(s) that auto-send this card in chat (LINE Flex / FB template).
    // Multiple keywords separated by comma or newline — any one match triggers.
    // Empty = never auto-sent (broadcast only).
    triggerKeyword: text("trigger_keyword"),
    // How keywords match the customer's message: "contains" (message includes the
    // keyword) or "exact" (whole message equals the keyword). Default "contains".
    triggerMatch: text("trigger_match").notNull().default("contains"),
    ...timestamps,
  },
  (t) => [index("flex_cards_tenant_idx").on(t.tenantId)],
);
