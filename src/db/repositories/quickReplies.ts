import { and, asc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { quickReplies } from "@/db/schema";

export type QuickReplyRow = typeof quickReplies.$inferSelect;

/** Active menu buttons for a tenant, in display order. */
export async function listActiveQuickReplies(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(quickReplies)
    .where(and(eq(quickReplies.tenantId, tenantId), eq(quickReplies.isActive, true)))
    .orderBy(asc(quickReplies.sortOrder), asc(quickReplies.createdAt));
}

/** All buttons (active + inactive) for the dashboard list. */
export async function listQuickReplies(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(quickReplies)
    .where(eq(quickReplies.tenantId, tenantId))
    .orderBy(asc(quickReplies.sortOrder), asc(quickReplies.createdAt));
}

export async function createQuickReply(
  db: DbClient,
  tenantId: string,
  input: { label: string; reply: string; sortOrder?: number },
) {
  await db.insert(quickReplies).values({ tenantId, ...input });
}

export async function deleteQuickReply(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(quickReplies)
    .where(and(eq(quickReplies.tenantId, tenantId), eq(quickReplies.id, id)));
}
