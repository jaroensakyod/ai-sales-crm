import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { products } from "./commerce";
import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/**
 * Merchant-defined quick-reply menu buttons. Each shows a `label` chip under the
 * bot's replies (like "คุยกับแอดมิน"); tapping it sends the label back, and the
 * bot answers with the canned `reply`. Lets customers self-serve common questions
 * (hours, how-to-order, shipping) without typing or waiting for a human.
 */
export const quickReplies = pgTable(
  "quick_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    label: text("label").notNull(), // shown on the chip (LINE caps at 20 chars)
    reply: text("reply").notNull(), // canned answer sent when tapped
    // Extra trigger keyword(s) (comma/newline separated) that also fire this reply
    // when a customer TYPES them — not just tapping the chip. Empty = label only.
    keywords: text("keywords"),
    // How keywords match a typed message: "exact" (whole message equals) or
    // "contains" (message includes the keyword). Default "exact". The chip label
    // always matches exactly regardless, so tapping a chip keeps working.
    matchType: text("match_type").notNull().default("exact"),
    // Optional: link this button to a specific product — when triggered, the bot
    // also sends that product's card (so the button acts as a shortcut to it).
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("quick_replies_tenant_idx").on(t.tenantId)],
);
