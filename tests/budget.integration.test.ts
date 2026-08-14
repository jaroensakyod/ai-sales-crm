import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { getMonthlyAiSpend } from "@/db/repositories/billing";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { aiRuns, tenantAiSettings, usageEvents } from "@/db/schema";
import type { GenerateFn } from "@/features/ai/gemini";
import { createAiReasonHandler } from "@/features/ai/sales-agent";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("AI soft-cap budget (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const generate: GenerateFn = async () => ({
    text: "คำตอบทดสอบค่ะ",
    inputTokens: 10,
    outputTokens: 10,
  });

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Budget Store",
      slug: `budget-${suffix}`,
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("counts only the current month's spend", async () => {
    // soft_cap_usd is numeric(scale=2), so caps are in whole cents; use $-scale
    // spend to exercise the tiers meaningfully.
    await db.insert(aiRuns).values({
      tenantId,
      model: "gemini-flash-latest",
      costUsd: "6.000000",
    });
    const spend = await getMonthlyAiSpend(db, tenantId);
    expect(spend).toBeCloseTo(6, 2);
  });

  it("downgrades the model when over the cap", async () => {
    // spend $6 with cap $5 => [5, 10) => downgraded.
    await db.insert(tenantAiSettings).values({ tenantId, softCapUsd: "5.00" });
    const handler = createAiReasonHandler(db, { generate });
    const answer = await handler({ tenantId, text: "แนะนำหน่อย" });
    expect(answer).toBe("คำตอบทดสอบค่ะ");

    const [run] = await db
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.tenantId, tenantId))
      .orderBy(desc(aiRuns.createdAt))
      .limit(1);
    expect(run.model).toBe("gemini-flash-lite-latest"); // downgraded to default
  });

  it("disables L3 (returns null) far over the cap", async () => {
    // spend $6 with cap $2 => >= 2x => l3_disabled.
    await db
      .update(tenantAiSettings)
      .set({ softCapUsd: "2.00" })
      .where(eq(tenantAiSettings.tenantId, tenantId));
    const handler = createAiReasonHandler(db, { generate });
    const answer = await handler({ tenantId, text: "อะไรก็ได้" });
    expect(answer).toBeNull(); // graceful: router will hand off

    const skipped = await db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.tenantId, tenantId));
    expect(skipped.some((u) => u.type === "l3_skipped_budget")).toBe(true);
  });
});
