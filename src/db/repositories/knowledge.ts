import { and, cosineDistance, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";

export async function listKnowledgeDocuments(
  db: DbClient,
  tenantId: string,
  category?: string,
) {
  return db
    .select({
      id: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      sourceType: knowledgeDocuments.sourceType,
      sourceText: knowledgeDocuments.sourceText,
      status: knowledgeDocuments.status,
      createdAt: knowledgeDocuments.createdAt,
      chunkCount: sql<number>`(
        select count(*)::int from ${knowledgeChunks}
        where ${knowledgeChunks.documentId} = ${knowledgeDocuments.id}
      )`,
    })
    .from(knowledgeDocuments)
    .where(
      category
        ? and(
            eq(knowledgeDocuments.tenantId, tenantId),
            eq(knowledgeDocuments.category, category),
          )
        : eq(knowledgeDocuments.tenantId, tenantId),
    )
    .orderBy(desc(knowledgeDocuments.createdAt));
}

/**
 * Reconstruct the saved text for a set of documents by stitching their chunks
 * back together (ordered as they were ingested). Used to let the merchant VIEW
 * what they saved — `listKnowledgeDocuments` intentionally omits the body.
 * Returns a map of documentId → full content.
 */
export async function getKnowledgeContents(
  db: DbClient,
  tenantId: string,
  documentIds: string[],
): Promise<Record<string, string>> {
  if (documentIds.length === 0) return {};
  const rows = await db
    .select({
      documentId: knowledgeChunks.documentId,
      content: knowledgeChunks.content,
    })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.tenantId, tenantId),
        inArray(knowledgeChunks.documentId, documentIds),
      ),
    )
    .orderBy(knowledgeChunks.createdAt);
  const byDoc: Record<string, string[]> = {};
  for (const r of rows) (byDoc[r.documentId] ??= []).push(r.content);
  return Object.fromEntries(
    Object.entries(byDoc).map(([id, parts]) => [id, parts.join("\n\n")]),
  );
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
    sourceText?: string;
    category?: string;
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
