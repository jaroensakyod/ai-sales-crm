import { and, asc, desc, eq, lte, or, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookEvent,
} from "@/db/schema";

// ---- Endpoints -----------------------------------------------------------

export async function listWebhookEndpoints(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, tenantId))
    .orderBy(desc(webhookEndpoints.createdAt));
}

export async function createWebhookEndpoint(
  db: DbClient,
  tenantId: string,
  input: { url: string; secret: string; events?: string[] | null },
) {
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      tenantId,
      url: input.url,
      secret: input.secret,
      events: input.events ?? null,
    })
    .returning();
  return row;
}

export async function deleteWebhookEndpoint(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  await db
    .delete(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)),
    );
}

export async function toggleWebhookEndpoint(
  db: DbClient,
  tenantId: string,
  id: string,
  active: boolean,
) {
  await db
    .update(webhookEndpoints)
    .set({ active, updatedAt: new Date() })
    .where(
      and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)),
    );
}

/** Active endpoints subscribed to this event (events null = all events). */
export async function endpointsForEvent(
  db: DbClient,
  tenantId: string,
  event: WebhookEvent,
) {
  const rows = await db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.tenantId, tenantId),
        eq(webhookEndpoints.active, true),
      ),
    );
  return rows.filter((e) => !e.events || e.events.includes(event));
}

// ---- Deliveries ----------------------------------------------------------

export async function enqueueDelivery(
  db: DbClient,
  tenantId: string,
  input: { endpointId: string; event: string; payload: unknown },
) {
  const [row] = await db
    .insert(webhookDeliveries)
    .values({
      tenantId,
      endpointId: input.endpointId,
      event: input.event,
      payload: input.payload,
    })
    .returning();
  return row;
}

/** PENDING deliveries whose next attempt is due, oldest first (system-wide). */
export async function getDueDeliveries(db: DbClient, now: Date, limit = 50) {
  return db
    .select({
      delivery: webhookDeliveries,
      url: webhookEndpoints.url,
      secret: webhookEndpoints.secret,
      active: webhookEndpoints.active,
    })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookEndpoints.id, webhookDeliveries.endpointId),
    )
    .where(
      and(
        eq(webhookDeliveries.status, "PENDING"),
        or(
          lte(webhookDeliveries.nextAttemptAt, now),
          sql`${webhookDeliveries.nextAttemptAt} is null`,
        ),
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit);
}

export async function markDeliverySent(
  db: DbClient,
  id: string,
  responseStatus: number,
  now: Date,
) {
  await db
    .update(webhookDeliveries)
    .set({
      status: "SENT",
      responseStatus,
      sentAt: now,
      attempts: sql`${webhookDeliveries.attempts} + 1`,
      updatedAt: now,
    })
    .where(eq(webhookDeliveries.id, id));
}

export async function markDeliveryRetry(
  db: DbClient,
  id: string,
  attempts: number,
  opts: { responseStatus?: number; error: string; nextAttemptAt: Date | null },
  now: Date,
) {
  // Give up (FAILED) once we're out of retries, else keep it PENDING for later.
  await db
    .update(webhookDeliveries)
    .set({
      status: opts.nextAttemptAt ? "PENDING" : "FAILED",
      attempts: attempts + 1,
      responseStatus: opts.responseStatus ?? null,
      lastError: opts.error.slice(0, 500),
      nextAttemptAt: opts.nextAttemptAt,
      updatedAt: now,
    })
    .where(eq(webhookDeliveries.id, id));
}

export async function recentDeliveries(
  db: DbClient,
  tenantId: string,
  limit = 20,
) {
  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.tenantId, tenantId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

// Re-export so features can import the event list without touching the schema.
export { WEBHOOK_EVENTS } from "@/db/schema";
export type { WebhookEvent } from "@/db/schema";
