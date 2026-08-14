import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { listOpenGaps } from "@/db/repositories/gaps";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { knowledgeChunks, knowledgeGaps } from "@/db/schema";
import type { EmbedFn } from "@/features/ai/embeddings";
import { answerGap } from "@/features/knowledge/answer-gap";
import { handleInboundText } from "@/features/messaging/pipeline";
import { channels } from "@/db/schema";

const hasDb = !!process.env.DATABASE_URL;
const fakeEmbed: EmbedFn = async () => new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0));

describe.skipIf(!hasDb)("knowledge gap inbox (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Gap Store",
      slug: `gap-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@gap-${suffix}`,
      })
      .returning();
    channelId = channel.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("logs a gap on a fallback (no answer), dedupes, skips refund handoff", async () => {
    const send = async () => {};
    // Unanswerable question, no L2/L3 handlers -> fallback handoff -> gap.
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `U-${suffix}`,
      text: "รับผ่อน 0% กี่เดือนคะ",
      channelMessageId: `g1-${suffix}`,
      send,
    });
    // Same question again -> no duplicate gap.
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `U-${suffix}`,
      text: "รับผ่อน 0% กี่เดือนคะ",
      channelMessageId: `g1b-${suffix}`,
      send,
    });
    // Refund keyword -> intentional handoff, NOT a gap.
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `U2-${suffix}`,
      text: "ขอคืนเงินด้วยค่ะ",
      channelMessageId: `g2-${suffix}`,
      send,
    });

    const gaps = await listOpenGaps(db, tenantId);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].question).toContain("ผ่อน");
  });

  it("answering a gap ingests knowledge and marks it ANSWERED", async () => {
    const [gap] = await listOpenGaps(db, tenantId);
    const ok = await answerGap(db, tenantId, gap.id, "รับผ่อน 0% นาน 3 เดือนค่ะ", {
      embed: fakeEmbed,
    });
    expect(ok).toBe(true);

    const [updated] = await db
      .select()
      .from(knowledgeGaps)
      .where(eq(knowledgeGaps.id, gap.id));
    expect(updated.status).toBe("ANSWERED");

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.tenantId, tenantId));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});
