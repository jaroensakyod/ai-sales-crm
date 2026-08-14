import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";

export async function listKnowledgeDocuments(db: DbClient, tenantId: string) {
  return db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      sourceType: knowledgeDocuments.sourceType,
      status: knowledgeDocuments.status,
      createdAt: knowledgeDocuments.createdAt,
      chunkCount: sql<number>`(
        select count(*)::int from ${knowledgeChunks}
        where ${knowledgeChunks.documentId} = ${knowledgeDocuments.id}
      )`,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.tenantId, tenantId))
    .orderBy(desc(knowledgeDocuments.createdAt));
}

/** Delete a document and its chunks (chunks cascade on document delete). */
export async function deleteKnowledgeDocument(
  db: DbClient,
  tenantId: string,
  documentId: string,
) {
  await db
    .delete(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.tenantId, tenantId),
        eq(knowledgeDocuments.id, documentId),
      ),
    );
}

export async function createKnowledgeDocument(
  db: DbClient,
  tenantId: string,
  input: {
    title: string;
    sourceType: (typeof knowledgeDocuments.sourceType.enumValues)[number];
    sourceUrl?: string;
  },
) {
  const [row] = await db
    .insert(knowledgeDocuments)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

export async function setDocumentStatus(
  db: DbClient,
  tenantId: string,
  documentId: string,
  status: (typeof knowledgeDocuments.status.enumValues)[number],
  error?: string,
) {
  await db
    .update(knowledgeDocuments)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeDocuments.tenantId, tenantId),
        eq(knowledgeDocuments.id, documentId),
      ),
    );
}

export async function insertChunks(
  db: DbClient,
  tenantId: string,
  documentId: string,
  chunks: { content: string; embedding: number[]; tokenCount?: number }[],
) {
  if (chunks.length === 0) return;
  await db.insert(knowledgeChunks).values(
    chunks.map((c) => ({
      tenantId,
      documentId,
      content: c.content,
      embedding: c.embedding,
      tokenCount: c.tokenCount,
    })),
  );
}

export type KnowledgeHit = {
  content: string;
  similarity: number;
};

/**
 * Cosine similarity search over this tenant's chunks (risk #8: tenant_id is in
 * the WHERE, so the HNSW scan never crosses tenants). similarity = 1 - distance.
 */
export async function searchChunks(
  db: DbClient,
  tenantId: string,
  queryEmbedding: number[],
  limit = 4,
  minSimilarity = 0,
): Promise<KnowledgeHit[]> {
  const similarity = sql<number>`1 - (${cosineDistance(
    knowledgeChunks.embedding,
    queryEmbedding,
  )})`;

  return db
    .select({ content: knowledgeChunks.content, similarity })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.tenantId, tenantId),
        gt(similarity, minSimilarity),
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);
}
