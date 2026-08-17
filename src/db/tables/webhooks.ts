import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** Events a merchant can subscribe an outbound webhook to. */
export const WEBHOOK_EVENTS = [
  "order.created",
  "payment.confirmed",
  "appointment.created",
  "booking.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * A merchant-registered URL we POST signed event payloads to (outbound webhook
 * for integrating the shop's own systems). `secret` signs the body (HMAC-SHA256
 * in X-Webhook-Signature). `events` null = all events, else a subset.
 */
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[] | null>(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("webhook_endpoints_tenant_idx").on(t.tenantId)],
);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "PENDING",
  "SENT",
  "FAILED",
]);

/**
 * One attempt-tracked delivery of an event to an endpoint. Enqueued PENDING on
 * the event (fast), then flushed by the /api/cron/webhooks processor so external
 * HTTP never blocks the chat/checkout path. Retries with backoff via nextAttemptAt.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: webhookDeliveryStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
    index("webhook_deliveries_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);
