import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { upsertLineConnection } from "@/db/repositories/line";
import { isWithin24hWindow } from "@/db/repositories/conversations";
import {
  channels,
  conversations,
  customerIdentities,
  messages,
} from "@/db/schema";
import { computeLineSignature } from "@/features/line/signature";
import { processLineWebhook } from "@/features/line/webhook";

const hasDb = !!process.env.DATABASE_URL;
const SECRET = "test-channel-secret-abc123";

describe.skipIf(!hasDb)("LINE webhook (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const lineUserId = `Utest${suffix}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "LINE Store",
      slug: `line-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "Test OA",
        externalId: `@line-${suffix}`,
      })
      .returning();
    channelId = channel.id;
    await upsertLineConnection(db, tenantId, channelId, {
      channelSecret: SECRET,
      accessToken: "test-access-token",
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  function makeBody(text: string, messageId: string) {
    return JSON.stringify({
      destination: "xxxx",
      events: [
        {
          type: "message",
          timestamp: Date.now(),
          source: { type: "user", userId: lineUserId },
          message: { type: "text", id: messageId, text },
        },
      ],
    });
  }

  it("rejects an invalid signature", async () => {
    const body = makeBody("hello", `m-bad-${suffix}`);
    const res = await processLineWebhook(db, channelId, body, "wrong-signature");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("accepts a signed message and records it end-to-end", async () => {
    const body = makeBody("สนใจลิปสติกสีแดงค่ะ", `m1-${suffix}`);
    const sig = computeLineSignature(SECRET, body);

    const res = await processLineWebhook(db, channelId, body, sig);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.processed).toBe(1);

    // Identity + customer created.
    const [identity] = await db
      .select()
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.tenantId, tenantId),
          eq(customerIdentities.externalId, lineUserId),
        ),
      );
    expect(identity).toBeTruthy();

    // Conversation opened and inside the 24h window.
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.customerId, identity.customerId));
    expect(convo.lastInboundAt).not.toBeNull();
    expect(await isWithin24hWindow(db, tenantId, convo.id)).toBe(true);

    // Message stored.
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convo.id));
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe("สนใจลิปสติกสีแดงค่ะ");
    expect(msgs[0].direction).toBe("INBOUND");
  });

  it("is idempotent on redelivered message id", async () => {
    const body = makeBody("ทักซ้ำ", `m2-${suffix}`);
    const sig = computeLineSignature(SECRET, body);

    const first = await processLineWebhook(db, channelId, body, sig);
    const second = await processLineWebhook(db, channelId, body, sig);
    expect(first.ok && first.processed).toBe(1);
    // Second delivery inserts nothing new.
    expect(second.ok && second.processed).toBe(0);
    if (second.ok) expect(second.skipped).toBe(1);
  });
});
