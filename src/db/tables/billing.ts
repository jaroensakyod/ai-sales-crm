import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** Subscription tiers (docs/03-requirements pricing). FREE = trial. */
export const planEnum = pgEnum("plan", ["FREE", "STARTER", "PRO"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
]);

/** One active subscription per tenant. Payment provider (Omise/2C2P) wires in later. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    plan: planEnum("plan").notNull().default("FREE"),
    status: subscriptionStatusEnum("status").notNull().default("TRIALING"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    ...timestamps,
  },
  (t) => [unique("subscriptions_tenant_uq").on(t.tenantId)],
);
