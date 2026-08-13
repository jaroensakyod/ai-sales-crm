import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { channels } from "./channels";
import {
  conversations,
  customers,
  messageCategoryEnum,
} from "./customers";
import { tenantId, users } from "./tenants";

export const followupStatusEnum = pgEnum("followup_status", [
  "SCHEDULED",
  "SENT",
  "SKIPPED", // window/consent check failed at send time
  "CANCELLED",
  "FAILED",
]);

/**
 * Central follow-up queue — channel-agnostic. Before sending, the engine checks
 * the 24h window (via conversations.lastInboundAt) and the message category
 * (transactional vs promotional). windowCheckPassed records that decision (risk #1).
 */
export const followups = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    channelId: uuid("channel_id").references(() => channels.id, {
      onDelete: "set null",
    }),
    category: messageCategoryEnum("category").notNull().default("TRANSACTIONAL"),
    status: followupStatusEnum("status").notNull().default("SCHEDULED"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    payload: jsonb("payload"),
    reason: text("reason"),
    windowCheckPassed: boolean("window_check_passed"),
    ...timestamps,
  },
  (t) => [
    index("followups_due_idx").on(t.tenantId, t.status, t.scheduledAt),
    index("followups_customer_idx").on(t.tenantId, t.customerId),
  ],
);

/** Trigger/action config for the follow-up + automation engine. */
export const automationRules = pgTable(
  "automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    trigger: jsonb("trigger").notNull(),
    action: jsonb("action").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("automation_rules_tenant_idx").on(t.tenantId)],
);

/**
 * Per-tenant AI guardrails. discountAuthority defaults to 0 — the AI can offer
 * nothing until a human raises it (risk #5: separate what AI says from what the
 * system permits).
 */
export const tenantAiSettings = pgTable(
  "tenant_ai_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    defaultModel: text("default_model").notNull().default("gemini-flash-lite"),
    escalationModel: text("escalation_model").notNull().default("gemini-flash"),
    discountAuthority: numeric("discount_authority", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    bannedPhrases: text("banned_phrases").array().notNull().default(sql`'{}'`),
    systemPromptExtra: text("system_prompt_extra"),
    // Internal safety net, not shown to merchant (docs/04-risks.md).
    softCapUsd: numeric("soft_cap_usd", { precision: 12, scale: 2 }),
    ...timestamps,
  },
  (t) => [unique("tenant_ai_settings_tenant_uq").on(t.tenantId)],
);

/** One row per Gemini call — cost/latency accounting and debugging. */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    // Message Router level that produced this run (1-4, docs/02-plan.md).
    routerLevel: integer("router_level"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull().default("ok"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("ai_runs_tenant_idx").on(t.tenantId, t.createdAt)],
);

/** Rolled-up metering per tenant for the cost dashboard + soft-cap. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    type: text("type").notNull(), // e.g. "ai_call", "line_push", "embedding"
    quantity: integer("quantity").notNull().default(1),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    meta: jsonb("meta"),
    ...timestamps,
  },
  (t) => [index("usage_events_tenant_idx").on(t.tenantId, t.createdAt)],
);

/** PDPA / T&C consent log — who accepted which version, when, from where (risk #3). */
export const agreementTypeEnum = pgEnum("agreement_type", [
  "DPA",
  "TOS",
  "PRIVACY",
]);

export const tenantAgreements = pgTable(
  "tenant_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    type: agreementTypeEnum("type").notNull(),
    version: text("version").notNull(),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("tenant_agreements_tenant_idx").on(t.tenantId, t.type)],
);

/** Immutable audit trail of sensitive actions (order edits, discounts, token changes). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    data: jsonb("data"),
    ip: text("ip"),
    ...timestamps,
  },
  (t) => [index("audit_logs_tenant_idx").on(t.tenantId, t.createdAt)],
);
