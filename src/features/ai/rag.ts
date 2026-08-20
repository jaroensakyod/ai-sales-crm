import type { DbClient } from "@/db/client";
import { recordAiRun, recordUsageEvent } from "@/db/repositories/ai";
import {
  createKnowledgeDocument,
  insertChunks,
  searchChunks,
  setDocumentStatus,
} from "@/db/repositories/knowledge";
import type { knowledgeDocuments } from "@/db/schema";
import type { LevelHandler } from "@/features/router/types";
import { toPlainText } from "@/lib/validation";

import { embedWithGemini, type EmbedFn } from "./embeddings";
import {
  estimateCostUsd,
  generateWithGemini,
  normalizeModelId,
  type GenerateFn,
} from "./gemini";

/** Below this cosine similarity, retrieved context is treated as irrelevant and
 *  the router falls through to Level 3 reasoning. */
const MIN_SIMILARITY = 0.6;
const RAG_MODEL = "gemini-flash-lite";

/**
 * Split text into ~maxChars chunks on paragraph boundaries, keeping a small
 * overlap so answers aren't cut mid-thought. Deliberately simple — good enough
 * for FAQ/policy docs (docs/02-plan.md).
 */
export function chunkText(text: string, maxChars = 600, overlap = 80): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
  };

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= maxChars) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }
    push();
    if (para.length <= maxChars) {
      current = para;
    } else {
      // Hard-split an oversized paragraph.
      for (let i = 0; i < para.length; i += maxChars - overlap) {
        chunks.push(para.slice(i, i + maxChars).trim());
      }
      current = "";
    }
  }
  push();
  return chunks;
}

/**
 * Ingest a document: chunk → embed → store. Marks the document READY on success
 * or FAILED on error. Returns the document id and chunk count.
 */
export async function ingestKnowledge(
  db: DbClient,
  tenantId: string,
  input: {
    title: string;
    text: string;
    sourceType?: (typeof knowledgeDocuments.sourceType.enumValues)[number];
    category?: string;
  },
  deps: { embed?: EmbedFn } = {},
): Promise<{ documentId: string; chunkCount: number }> {
  const embed = deps.embed ?? embedWithGemini;
  const doc = await createKnowledgeDocument(db, tenantId, {
    title: input.title,
    sourceType: input.sourceType ?? "TEXT",
    category: input.category ?? "general",
  });

  try {
    const chunks = chunkText(input.text);
    const embedded = await Promise.all(
      chunks.map(async (content) => ({
        content,
        embedding: await embed(content),
      })),
    );
    await insertChunks(db, tenantId, doc.id, embedded);
    await setDocumentStatus(db, tenantId, doc.id, "READY");
    return { documentId: doc.id, chunkCount: embedded.length };
  } catch (err) {
    await setDocumentStatus(
      db,
      tenantId,
      doc.id,
      "FAILED",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

/**
 * Level 2 handler: retrieve this tenant's knowledge and answer grounded in it.
 * Returns null when nothing relevant is found (→ router escalates to L3) or the
 * grounded answer is empty. Records embedding usage + the grounding ai_run.
 */
export function createKnowledgeSearchHandler(
  db: DbClient,
  deps: { embed?: EmbedFn; generate?: GenerateFn } = {},
): LevelHandler {
  const embed = deps.embed ?? embedWithGemini;
  const generate = deps.generate ?? generateWithGemini;

  return async (ctx) => {
    let hits;
    try {
      const queryEmbedding = await embed(ctx.text);
      await recordUsageEvent(db, ctx.tenantId, { type: "embedding" });
      hits = await searchChunks(
        db,
        ctx.tenantId,
        queryEmbedding,
        4,
        MIN_SIMILARITY,
      );
    } catch {
      return null; // embedding/search failed → let L3 try
    }
    if (hits.length === 0) return null;

    const context = hits
      .map((h, i) => `[${i + 1}] ${h.content}`)
      .join("\n\n");
    const systemInstruction = [
      "ตอบคำถามลูกค้าโดยอ้างอิงจาก 'ข้อมูลร้าน' ด้านล่างเท่านั้น",
      "ถ้าข้อมูลไม่พอ ให้บอกว่ายังไม่แน่ใจและจะให้ทีมงานช่วยตอบ ห้ามเดา",
      "ตอบสั้น สุภาพ ภาษาไทย",
      "",
      "ข้อมูลร้าน:",
      context,
    ].join("\n");

    const started = Date.now();
    let result;
    try {
      result = await generate({
        model: RAG_MODEL,
        systemInstruction,
        userText: ctx.text,
      });
    } catch (err) {
      await recordAiRun(db, ctx.tenantId, {
        conversationId: ctx.conversationId,
        model: normalizeModelId(RAG_MODEL),
        routerLevel: 2,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      });
      return null;
    }

    const costUsd = estimateCostUsd(
      RAG_MODEL,
      result.inputTokens,
      result.outputTokens,
    );
    await recordAiRun(db, ctx.tenantId, {
      conversationId: ctx.conversationId,
      model: normalizeModelId(RAG_MODEL),
      routerLevel: 2,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      latencyMs: Date.now() - started,
      status: "ok",
    });
    await recordUsageEvent(db, ctx.tenantId, {
      type: "ai_call",
      costUsd,
      meta: { model: normalizeModelId(RAG_MODEL), level: 2 },
    });

    const text = toPlainText(result.text.trim());
    return text || null;
  };
}
