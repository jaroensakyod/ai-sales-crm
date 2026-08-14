import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import {
  createKnowledgeDocument,
  insertChunks,
  searchChunks,
} from "@/db/repositories/knowledge";
import { aiRuns } from "@/db/schema";
import type { EmbedFn } from "@/features/ai/embeddings";
import type { GenerateFn } from "@/features/ai/gemini";
import {
  createKnowledgeSearchHandler,
  ingestKnowledge,
} from "@/features/ai/rag";

const hasDb = !!process.env.DATABASE_URL;

// Deterministic 768-dim embedding: topic keyword -> a fixed unit dimension.
// Similar topics collide (cosine 1), different topics are orthogonal (cosine 0).
const TOPIC_DIM: Record<string, number> = {
  จัดส่ง: 0,
  ส่ง: 0,
  เปิด: 1,
  เวลา: 1,
};
const fakeEmbed: EmbedFn = async (text) => {
  const v = new Array(768).fill(0);
  let matched = false;
  for (const [kw, dim] of Object.entries(TOPIC_DIM)) {
    if (text.includes(kw)) {
      v[dim] = 1;
      matched = true;
    }
  }
  if (!matched) v[700] = 1; // orthogonal to all chunks
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / mag);
};

describe.skipIf(!hasDb)("RAG retrieval + L2 handler (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "RAG Store",
      slug: `rag-${suffix}`,
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("cosine search returns the on-topic chunk and filters the rest", async () => {
    const doc = await createKnowledgeDocument(db, tenantId, {
      title: "FAQ",
      sourceType: "TEXT",
    });
    await insertChunks(db, tenantId, doc.id, [
      { content: "จัดส่งภายใน 2-3 วันทำการ", embedding: await fakeEmbed("จัดส่ง") },
      { content: "ร้านเปิด 9:00-18:00 น.", embedding: await fakeEmbed("เปิด เวลา") },
    ]);

    const hits = await searchChunks(
      db,
      tenantId,
      await fakeEmbed("จัดส่งกี่วัน"),
      4,
      0.5,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toContain("จัดส่ง");
    expect(hits[0].similarity).toBeGreaterThan(0.9);
  });

  it("L2 handler ingests, retrieves, and answers grounded", async () => {
    await ingestKnowledge(
      db,
      tenantId,
      { title: "Shipping policy", text: "การจัดส่งใช้เวลา 2-3 วันทำการ ค่าส่ง 40 บาท" },
      { embed: fakeEmbed },
    );

    const generate: GenerateFn = async () => ({
      text: "จัดส่ง 2-3 วันทำการค่ะ ค่าส่ง 40 บาท",
      inputTokens: 60,
      outputTokens: 25,
    });
    const handler = createKnowledgeSearchHandler(db, {
      embed: fakeEmbed,
      generate,
    });

    const answer = await handler({ tenantId, text: "จัดส่งกี่วันคะ" });
    expect(answer).toContain("จัดส่ง");

    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.tenantId, tenantId))
      .orderBy(desc(aiRuns.createdAt))
      .limit(1);
    expect(run.routerLevel).toBe(2);
    expect(run.status).toBe("ok");
  });

  it("returns null when nothing relevant is found (→ escalate to L3)", async () => {
    const generate: GenerateFn = async () => ({ text: "should not be called" });
    const handler = createKnowledgeSearchHandler(db, {
      embed: fakeEmbed,
      generate,
    });
    // Unknown topic → orthogonal vector → no chunk above threshold.
    const answer = await handler({ tenantId, text: "อยากรู้เรื่องอื่นที่ไม่มีข้อมูล" });
    expect(answer).toBeNull();
  });
});
