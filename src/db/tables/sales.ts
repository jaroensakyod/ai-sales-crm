import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { conversations, customers } from "./customers";
import { tenantId, users } from "./tenants";

/** Configurable pipeline per tenant — not hard-coded stages. */
export const salesStages = pgTable(
  "sales_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("sales_stages_tenant_idx").on(t.tenantId)],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    stageId: uuid("stage_id").references(() => salesStages.id, {
      onDelete: "set null",
    }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Lead scoring (0-100) — feeds prioritization, part of the Pro differentiator.
    score: integer("score").notNull().default(0),
    estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
    ...timestamps,
  },
  (t) => [
    index("leads_tenant_stage_idx").on(t.tenantId, t.stageId),
    index("leads_tenant_customer_idx").on(t.tenantId, t.customerId),
  ],
);

/** Append-only lead activity log (stage moves, score changes, touches). */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    data: jsonb("data"),
    ...timestamps,
  },
  (t) => [index("lead_events_lead_idx").on(t.tenantId, t.leadId)],
);

/** Objection Engine — classify why a customer hesitates (docs/01-summary.md). */
export const objectionTypeEnum = pgEnum("objection_type", [
  "PRICE",
  "TRUST",
  "TIMING",
  "NEED",
  "COMPETITOR",
  "SHIPPING",
  "OTHER",
]);

export const objections = pgTable(
  "objections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    type: objectionTypeEnum("type").notNull(),
    detail: text("detail"),
    resolved: boolean("resolved").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("objections_tenant_type_idx").on(t.tenantId, t.type)],
);
