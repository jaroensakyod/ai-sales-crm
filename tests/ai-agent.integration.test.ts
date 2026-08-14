import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { aiRuns, tenantAiSettings, usageEvents } from "@/db/schema";
import { createAiReasonHandler } from "@/features/ai/sales-agent";
import type { GenerateFn } from "@/features/ai/gemini";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("AI reason handler (integration, mocked Gemini)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "AI Store",
      slug: `ai-${suffix}`,
    });
    tenantId = tenant.id;
    await db.insert(tenantAiSettings).values({
      tenantId,
      bannedPhrases: ["รักษาสิว", "หน้าใส 100%"],
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  async function latestRun() {
    const [row] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.tenantId, tenantId))
      .orderBy(desc(aiRuns.createdAt))
      .limit(1);
    return row;
  }

  it("returns the answer and records an ai_run + usage_event", async () => {
    const generate: GenerateFn = async () => ({
      text: "แนะนำลิปสติกสีแดงเข้ากับผิวคุณค่ะ",
      inputTokens: 120,
      outputTokens: 40,
    });
    const handler = createAiReasonHandler(db, { generate });

    const answer = await handler({ tenantId, text: "แนะนำลิปหน่อย" });
    expect(answer).toBe("แนะนำลิปสติกสีแดงเข้ากับผิวคุณค่ะ");

    const run = await latestRun();
    expect(run.status).toBe("ok");
    expect(run.model).toBe("gemini-flash-latest");
    expect(run.routerLevel).toBe(3);
    expect(Number(run.costUsd)).toBeGreaterThan(0);

    const usage = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(usage.length).toBeGreaterThanOrEqual(1);
  });

  it("blocks banned-phrase output and hands off (returns null)", async () => {
    const generate: GenerateFn = async () => ({
      text: "ครีมนี้รักษาสิวได้ภายใน 3 วัน",
      inputTokens: 50,
      outputTokens: 20,
    });
    const handler = createAiReasonHandler(db, { generate });

    const answer = await handler({ tenantId, text: "ครีมรักษาสิวมีไหม" });
    expect(answer).toBeNull(); // policy violation → router will hand off

    const run = await latestRun();
    expect(run.status).toBe("blocked");
    expect(run.error).toContain("รักษาสิว");
  });

  it("records an error and returns null when Gemini throws", async () => {
    const generate: GenerateFn = async () => {
      throw new Error("gemini 503");
    };
    const handler = createAiReasonHandler(db, { generate });

    const answer = await handler({ tenantId, text: "อะไรก็ได้" });
    expect(answer).toBeNull();

    const run = await latestRun();
    expect(run.status).toBe("error");
    expect(run.error).toContain("503");
  });
});
