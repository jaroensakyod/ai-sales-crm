import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { scheduledBroadcasts } from "@/db/schema";

type BroadcastStatus = "SCHEDULED" | "SENT" | "SKIPPED" | "CANCELLED" | "FAILED";

/** Queue a promo to fire at a future time. */
export async function createScheduledBroadcast(
  db: DbClient,
  tenantId: string,
  input: { text?: string | null; imageUrl?: string | null; scheduledAt: Date },
) {
  const [row] = await db
    .insert(scheduledBroadcasts)
    .values({
      tenantId,
      text: input.text ?? null,
      imageUrl: input.imageUrl ?? null,
      scheduledAt: input.scheduledAt,
    })
    .returning();
  return row;
}

/** Upcoming + recent scheduled broadcasts for the dashboard (newest first). */
export async function listScheduledBroadcasts(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(scheduledBroadcasts)
    .where(eq(scheduledBroadcasts.tenantId, tenantId))
    .orderBy(desc(scheduledBroadcasts.scheduledAt))
    .limit(50);
}

/** Cancel a still-pending broadcast (no-op if already sent/cancelled). */
export async function cancelScheduledBroadcast(
  db: DbClient,
  tenantId: string,
  id: string,
) {
  await db
    .update(scheduledBroadcasts)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(
      and(
        eq(scheduledBroadcasts.tenantId, tenantId),
        eq(scheduledBroadcasts.id, id),
        eq(scheduledBroadcasts.status, "SCHEDULED"),
      ),
    );
}

/** Due = SCHEDULED and scheduledAt has passed. Oldest first, capped. */
export async function getDueBroadcasts(db: DbClient, now: Date, limit = 20) {
  return db
    .select()
    .from(scheduledBroadcasts)
    .where(
      and(
        eq(scheduledBroadcasts.status, "SCHEDULED"),
        lte(scheduledBroadcasts.scheduledAt, now),
      ),
    )
    .orderBy(asc(scheduledBroadcasts.scheduledAt))
    .limit(limit);
}

export async function markBroadcast(
  db: DbClient,
  id: string,
  status: BroadcastStatus,
  extra: { error?: string | null; sentAt?: Date } = {},
) {
  await db
    .update(scheduledBroadcasts)
    .set({
      status,
      error: extra.error ?? null,
      sentAt: extra.sentAt,
      updatedAt: new Date(),
    })
    .where(inArray(scheduledBroadcasts.id, [id]));
}
