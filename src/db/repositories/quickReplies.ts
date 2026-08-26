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
  input: {
    label: string;
    reply: string;
    keywords?: string | null;
    matchType?: string;
    productId?: string | null;
    sortOrder?: number;
  },
) {
  await db.insert(quickReplies).values({ tenantId, ...input });
}

/** Does a typed message trigger this quick reply? The chip label always matches
 *  exactly (so tapping works); extra keywords match per the reply's matchType. */
export function quickReplyMatches(
  row: { label: string; keywords?: string | null; matchType?: string | null },
  text: string,
): boolean {
  const n = text.trim().toLowerCase();
  if (n === row.label.trim().toLowerCase()) return true;
  const keywords = (row.keywords ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  if (keywords.length === 0) return false;
  const exact = row.matchType !== "contains";
  return keywords.some((kw) => (exact ? n === kw : n.includes(kw)));
}

export async function deleteQuickReply(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(quickReplies)
    .where(and(eq(quickReplies.tenantId, tenantId), eq(quickReplies.id, id)));
}
