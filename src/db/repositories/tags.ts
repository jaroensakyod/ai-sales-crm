import { and, asc, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { chatTags } from "@/db/schema";

export async function listTags(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(chatTags)
    .where(eq(chatTags.tenantId, tenantId))
    .orderBy(asc(chatTags.name));
}

export async function listActiveTags(db: DbClient, tenantId: string) {
  return db
    .select({
      id: chatTags.id,
      name: chatTags.name,
      keywords: chatTags.keywords,
      guidance: chatTags.guidance,
    })
    .from(chatTags)
    .where(and(eq(chatTags.tenantId, tenantId), eq(chatTags.isActive, true)));
}

export async function createTag(
  db: DbClient,
  tenantId: string,
  input: { name: string; keywords: string[]; guidance: string },
) {
  await db.insert(chatTags).values({ tenantId, ...input });
}

export async function toggleTag(db: DbClient, tenantId: string, id: string) {
  await db
    .update(chatTags)
    .set({ isActive: sql`NOT ${chatTags.isActive}`, updatedAt: new Date() })
    .where(and(eq(chatTags.tenantId, tenantId), eq(chatTags.id, id)));
}

export async function deleteTag(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(chatTags)
    .where(and(eq(chatTags.tenantId, tenantId), eq(chatTags.id, id)));
}
