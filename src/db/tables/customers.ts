import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { channels } from "./channels";
import { tenantId } from "./tenants";

/**
 * A person the tenant talks to. Starts as one row but a single human can hold
 * several channel identities (Messenger PSID + LINE userId) merged under one
 * customer (docs/02-plan.md).
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    displayName: text("display_name"),
    phone: text("phone"),
    email: text("email"),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    // PDPA: personalization profiling needs a SEPARATE opt-in, not just T&C (risk #3).
    profilingConsent: boolean("profiling_consent").notNull().default(false),
    profilingConsentAt: timestamp("profiling_consent_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (t) => [index("customers_tenant_idx").on(t.tenantId)],
);

/**
 * (channel_id + external_id) scoped identity — the pre-merge key from the plan.
 * externalId = Messenger PSID / LINE userId.
 */
export const customerIdentities = pgTable(
  "customer_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    ...timestamps,
  },
  (t) => [
    unique("cust_identity_channel_external_uq").on(
      t.tenantId,
      t.channelId,
      t.externalId,
    ),
    index("cust_identity_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const conversationStatusEnum = pgEnum("conversation_status", [
  "OPEN",
  "SNOOZED",
  "HANDOFF", // escalated to a human (Message Router Level 4)
  "CLOSED",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    status: conversationStatusEnum("status").notNull().default("OPEN"),
    // Drives the Meta 24-hour messaging window check before any follow-up (risk #1).
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    assignedUserId: uuid("assigned_user_id"),
    ...timestamps,
  },
  (t) => [
    index("conversations_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("conversations_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const messageDirectionEnum = pgEnum("message_direction", [
  "INBOUND",
  "OUTBOUND",
]);

/** Category gates what may be sent outside the 24h window (risk #1). */
export const messageCategoryEnum = pgEnum("message_category", [
  "CONVERSATIONAL",
  "TRANSACTIONAL", // order/shipping updates — allowed via post-purchase tag
  "PROMOTIONAL", // sales/cross-sell — needs LINE or FB opt-in
]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    category: messageCategoryEnum("category")
      .notNull()
      .default("CONVERSATIONAL"),
    // Provider message id, for idempotent webhook processing / dedupe.
    channelMessageId: text("channel_message_id"),
    body: text("body"),
    payload: jsonb("payload"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("messages_conversation_idx").on(t.tenantId, t.conversationId),
    unique("messages_channel_msg_uq").on(t.tenantId, t.channelMessageId),
  ],
);

/** Durable per-customer facts the AI "remembers" (KV). */
export const customerMemories = pgTable(
  "customer_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    source: text("source"), // e.g. "ai", "manual", "order"
    ...timestamps,
  },
  (t) => [
    unique("customer_memories_key_uq").on(t.tenantId, t.customerId, t.key),
    index("customer_memories_customer_idx").on(t.tenantId, t.customerId),
  ],
);
