import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** Max reviews a shop can store — a hard cap so this table never bloats. */
export const REVIEW_CAP = 12;

/**
 * A customer review / social proof the shop uploads (usually a screenshot of a
 * LINE/FB review, optionally with a caption + author). The bot sends these when
 * a customer asks "any reviews?". Capped at REVIEW_CAP per tenant.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    imageUrl: text("image_url"),
    caption: text("caption"),
    authorName: text("author_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("reviews_tenant_idx").on(t.tenantId, t.sortOrder)],
);
