import { pgEnum, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

export const authProviderEnum = pgEnum("auth_provider", [
  "LINE",
  "FACEBOOK",
  "EMAIL",
]);

/**
 * A merchant/owner account — the person who signs in (via LINE, Facebook, or
 * email+password) and owns one or more stores (tenants). Global, not scoped to a
 * tenant. Identified by (provider, providerId) so the same account always maps
 * to one owner. For EMAIL, providerId is the lowercased email and passwordHash
 * holds a scrypt hash (see lib/password.ts).
 */
export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: authProviderEnum("provider").notNull(),
    providerId: text("provider_id").notNull(),
    displayName: text("display_name"),
    email: text("email"),
    pictureUrl: text("picture_url"),
    passwordHash: text("password_hash"),
    ...timestamps,
  },
  (t) => [unique("owners_provider_uq").on(t.provider, t.providerId)],
);
