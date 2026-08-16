import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { upsertFacebookConnection } from "@/db/repositories/facebook";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import {
  channels,
  conversations,
  customerIdentities,
  messages,
  products,
} from "@/db/schema";
import { computeFacebookSignature } from "@/features/facebook/signature";
import {
  processFacebookWebhook,
  processFacebookWebhookByPage,
} from "@/features/facebook/webhook";

const hasDb = !!process.env.DATABASE_URL;
const APP_SECRET = "test-app-secret-fb";

describe.skipIf(!hasDb)("Facebook webhook (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const psid = `PSID-${suffix}`;

  beforeAll(async () => {
    process.env.META_APP_SECRET = APP_SECRET;
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "FB Store",
      slug: `fb-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "MESSENGER",
        displayName: "FB Page",
        externalId: `page-${suffix}`,
      })
      .returning();
    channelId = channel.id;
    await upsertFacebookConnection(db, tenantId, channelId, {
      pageId: `page-${suffix}`,
      accessToken: "page-token-unused-in-test",
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

  function body(text: string, mid: string) {
    return JSON.stringify({
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: psid },
              timestamp: Date.now(),
              message: { mid, text },
            },
          ],
        },
      ],
    });
  }

  it("rejects an invalid signature", async () => {
    const res = await processFacebookWebhook(
      db,
      channelId,
      body("hi", `m0-${suffix}`),
      "sha256=bad",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("answers a signed message end-to-end via Send API (spy)", async () => {
    const payload = body("ลิปสติกสีแดง ราคาเท่าไหร่คะ", `m1-${suffix}`);
    const sig = computeFacebookSignature(APP_SECRET, payload);

    const sent: { to: string; text: string }[] = [];
    const res = await processFacebookWebhook(db, channelId, payload, sig, {
      send: async (to, text) => {
        sent.push({ to, text });
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.processed).toBe(1);
      expect(res.replied).toBe(1);
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(psid);
    expect(sent[0].text).toContain("390");

    // Identity + both messages persisted.
    const [identity] = await db
      .select()
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.tenantId, tenantId),
          eq(customerIdentities.externalId, psid),
        ),
      );
    expect(identity).toBeTruthy();

    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.channelId, channelId));
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, convo.id));
    expect(rows.map((m) => m.direction).sort()).toEqual(["INBOUND", "OUTBOUND"]);
  });

  it("is idempotent on redelivered mid", async () => {
    const payload = body("ทักซ้ำ", `m2-${suffix}`);
    const sig = computeFacebookSignature(APP_SECRET, payload);
    const first = await processFacebookWebhook(db, channelId, payload, sig, {
      send: async () => {},
    });
    const second = await processFacebookWebhook(db, channelId, payload, sig, {
      send: async () => {},
    });
    expect(first.ok && first.processed).toBe(1);
    expect(second.ok && second.processed).toBe(0);
  });

  it("single-app route dispatches by page id (entry.id) to the right tenant", async () => {
    // No channelId in the call — routing is purely by the page id in the payload.
    const payload = JSON.stringify({
      object: "page",
      entry: [
        {
          id: `page-${suffix}`,
          messaging: [
            {
              sender: { id: psid },
              timestamp: Date.now(),
              message: { mid: `mp-${suffix}`, text: "ลิปสติกสีแดง ราคาเท่าไหร่คะ" },
            },
          ],
        },
      ],
    });
    const sig = computeFacebookSignature(APP_SECRET, payload);
    const sent: string[] = [];
    const res = await processFacebookWebhookByPage(db, payload, sig, {
      send: async (_to, text) => {
        sent.push(text);
      },
    });
    expect(res.ok && res.processed).toBe(1);
    expect(sent[0]).toContain("390");
  });

  it("single-app route ignores an unknown page (still 200, no throw)", async () => {
    const payload = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page-that-is-not-connected",
          messaging: [
            {
              sender: { id: psid },
              timestamp: Date.now(),
              message: { mid: `mx-${suffix}`, text: "hello" },
            },
          ],
        },
      ],
    });
    const sig = computeFacebookSignature(APP_SECRET, payload);
    const res = await processFacebookWebhookByPage(db, payload, sig, {
      send: async () => {},
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.processed).toBe(0);
  });
});
