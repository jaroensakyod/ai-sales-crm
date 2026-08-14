import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { upsertLineConnection } from "@/db/repositories/line";
import { channels, conversations, messages, products } from "@/db/schema";
import { computeLineSignature } from "@/features/line/signature";
import { processLineWebhook } from "@/features/line/webhook";

const hasDb = !!process.env.DATABASE_URL;
const SECRET = "reply-secret-xyz";

describe.skipIf(!hasDb)("LINE inbound -> router -> reply (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const lineUserId = `Ureply${suffix}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Reply Store",
      slug: `reply-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@reply-${suffix}`,
      })
      .returning();
    channelId = channel.id;
    await upsertLineConnection(db, tenantId, channelId, {
      channelSecret: SECRET,
      accessToken: "unused-in-test",
    });
    await db.insert(products).values({
      tenantId,
      sku: `LIP-${suffix}`,
      name: "ลิปสติกสีแดง Matte",
      price: "390",
      stock: 50,
      currency: "THB",
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("answers a price question in the chat and records the outbound", async () => {
    const body = JSON.stringify({
      events: [
        {
          type: "message",
          timestamp: Date.now(),
          replyToken: `rt-${suffix}`,
          source: { type: "user", userId: lineUserId },
          message: {
            type: "text",
            id: `m-${suffix}`,
            text: "ลิปสติกสีแดง ราคาเท่าไหร่คะ",
          },
        },
      ],
    });
    const sig = computeLineSignature(SECRET, body);

    // Spy reply transport — no real LINE call.
    const sent: { replyToken: string; text: string }[] = [];
    const res = await processLineWebhook(db, channelId, body, sig, {
      reply: async (replyToken, text) => {
        sent.push({ replyToken, text });
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.processed).toBe(1);
      expect(res.replied).toBe(1);
    }

    // The customer got a Level-1 price answer.
    expect(sent).toHaveLength(1);
    expect(sent[0].replyToken).toBe(`rt-${suffix}`);
    expect(sent[0].text).toContain("390");

    // Both inbound and outbound are persisted.
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.channelId, channelId));
    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.conversationId, convo.id),
        ),
      );
    const directions = rows.map((m) => m.direction).sort();
    expect(directions).toEqual(["INBOUND", "OUTBOUND"]);
    expect(convo.lastOutboundAt).not.toBeNull();
  });
});
