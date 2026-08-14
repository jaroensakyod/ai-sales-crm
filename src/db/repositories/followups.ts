import { and, asc, eq, lte } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { followups } from "@/db/schema";

export async function scheduleFollowup(
  db: DbClient,
  tenantId: string,
  input: {
    customerId: string;
    conversationId?: string;
    channelId?: string;
    category?: (typeof followups.category.enumValues)[number];
    scheduledAt: Date;
    payload?: unknown;
    reason?: string;
  },
) {
  const [row] = await db
    .insert(followups)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

/**
 * Due, not-yet-sent follow-ups across ALL tenants (this is a system scheduler,
 * not a tenant-scoped request). Each row still carries tenant_id and every
 * downstream write filters by it.
 */
export async function getDueFollowups(
  db: DbClient,
  now: Date,
  limit = 50,
) {
  return db
    .select()
    .from(followups)
    .where(and(eq(followups.status, "SCHEDULED"), lte(followups.scheduledAt, now)))
    .orderBy(asc(followups.scheduledAt))
    .limit(limit);
}

export async function markFollowup(
  db: DbClient,
  tenantId: string,
  id: string,
  status: (typeof followups.status.enumValues)[number],
  opts: { reason?: string; windowCheckPassed?: boolean; sentAt?: Date } = {},
) {
  await db
    .update(followups)
    .set({
      status,
      reason: opts.reason,
      windowCheckPassed: opts.windowCheckPassed,
      sentAt: opts.sentAt,
      updatedAt: new Date(),
    })
    .where(and(eq(followups.tenantId, tenantId), eq(followups.id, id)));
}
