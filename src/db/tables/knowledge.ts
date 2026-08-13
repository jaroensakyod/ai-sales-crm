import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { conversations } from "./customers";
import { tenantId, users } from "./tenants";

export const knowledgeSourceTypeEnum = pgEnum("knowledge_source_type", [
  "TEXT",
  "PDF",
  "DOCX",
  "XLSX",
  "URL",
]);

export const knowledgeStatusEnum = pgEnum("knowledge_status", [
  "PROCESSING",
  "READY",
  "FAILED",
]);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    sourceType: knowledgeSourceTypeEnum("source_type").notNull(),
    sourceUrl: text("source_url"),
    status: knowledgeStatusEnum("status").notNull().default("PROCESSING"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("knowledge_docs_tenant_idx").on(t.tenantId)],
);

/**
 * RAG chunks with pgvector embeddings. Dimension 768 = Gemini text-embedding-004.
 * Requires the `vector` extension (created in migration 0000).
 * An IVFFlat/HNSW index is added in a follow-up migration once data exists.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    tokenCount: integer("token_count"),
    ...timestamps,
  },
  (t) => [index("knowledge_chunks_document_idx").on(t.tenantId, t.documentId)],
);

/** Knowledge Gap Inbox — questions the AI couldn't answer (Phase 2 feature). */
export const knowledgeGapStatusEnum = pgEnum("knowledge_gap_status", [
  "OPEN",
  "ANSWERED",
  "DISMISSED",
]);

export const knowledgeGaps = pgTable(
  "knowledge_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    question: text("question").notNull(),
    status: knowledgeGapStatusEnum("status").notNull().default("OPEN"),
    answer: text("answer"),
    answeredByUserId: uuid("answered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("knowledge_gaps_tenant_status_idx").on(t.tenantId, t.status)],
);
