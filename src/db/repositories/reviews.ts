import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { REVIEW_CAP, reviews } from "@/db/schema";

export { REVIEW_CAP };

export async function listReviews(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId))
    .orderBy(asc(reviews.sortOrder), desc(reviews.createdAt));
}

export async function countReviews(
  db: DbClient,
  tenantId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId));
  return row?.n ?? 0;
}

export type CreateReviewResult =
  | { ok: true; id: string }
  | { ok: false; reason: "cap" | "empty" };

/** Add a review, enforcing the per-tenant cap so the table can't bloat. */
export async function createReview(
  db: DbClient,
  tenantId: string,
  input: { imageUrl?: string | null; caption?: string | null; authorName?: string | null },
): Promise<CreateReviewResult> {
  if (!input.imageUrl && !input.caption?.trim()) {
    return { ok: false, reason: "empty" };
  }
  if ((await countReviews(db, tenantId)) >= REVIEW_CAP) {
    return { ok: false, reason: "cap" };
  }
  const [row] = await db
    .insert(reviews)
    .values({
      tenantId,
      imageUrl: input.imageUrl ?? null,
      caption: input.caption?.trim() || null,
      authorName: input.authorName?.trim() || null,
    })
    .returning();
  return { ok: true, id: row.id };
}

export async function deleteReview(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(reviews)
    .where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id)));
}
