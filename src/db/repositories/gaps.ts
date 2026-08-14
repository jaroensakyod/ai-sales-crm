import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { knowledgeGaps } from "@/db/schema";

export async function createKnowledgeGap(
  db: DbClient,
  tenantId: string,
  input: { question: string; conversationId?: string },
) {
  const [row] = await db
    .insert(knowledgeGaps)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

/** Existing unanswered gap with the same question (dedupe before inserting). */
export async function findOpenGap(
  db: DbClient,
  tenantId: string,
  question: string,
) {
  const [row] = await db
    .select()
    .from(knowledgeGaps)
    .where(
      and(
        eq(knowledgeGaps.tenantId, tenantId),
        eq(knowledgeGaps.status, "OPEN"),
        eq(knowledgeGaps.question, question),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getGap(db: DbClient, tenantId: string, gapId: string) {
  const [row] = await db
    .select()
    .from(knowledgeGaps)
    .where(
      and(eq(knowledgeGaps.tenantId, tenantId), eq(knowledgeGaps.id, gapId)),
    );
  return row ?? null;
}

export async function listOpenGaps(db: DbClient, tenantId: string, limit = 50) {
  return db
    .select()
    .from(knowledgeGaps)
    .where(
      and(
        eq(knowledgeGaps.tenantId, tenantId),
        eq(knowledgeGaps.status, "OPEN"),
      ),
    )
    .orderBy(desc(knowledgeGaps.createdAt))
    .limit(limit);
}

export async function markGapAnswered(
  db: DbClient,
  tenantId: string,
  gapId: string,
  answer: string,
  answeredByUserId?: string,
) {
  await db
    .update(knowledgeGaps)
    .set({
      status: "ANSWERED",
      answer,
      answeredByUserId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(knowledgeGaps.tenantId, tenantId), eq(knowledgeGaps.id, gapId)),
    );
}
