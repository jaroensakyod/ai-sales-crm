import { timestamp } from "drizzle-orm/pg-core";

/**
 * Standard created/updated columns. Spread into every table:  ...timestamps
 * updatedAt is app-maintained (bump it on writes); DB default seeds the first value.
 */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};
