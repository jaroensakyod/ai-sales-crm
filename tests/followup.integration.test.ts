import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import {
  openConversation,
  recordInboundMessage,
} from "@/db/repositories/conversations";
import { scheduleFollowup } from "@/db/repositories/followups";
import { setPlan } from "@/db/repositories/subscriptions";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels, customerIdentities, followups } from "@/db/schema";
import { processDueFollowups, type PushFn } from "@/features/followup/engine";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("follow-up engine (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let lineChannelId: string;
  let fbChannelId: string;
  let customerId: string;
  let openConvoId: string; // has a recent inbound → window open
  let staleConvoId: string; // no inbound → window closed
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "FU Store",
      slug: `fu-${suffix}`,
    });
    tenantId = tenant.id;
    await setPlan(db, tenantId, "PRO"); // promotional follow-up automation is Pro

    const [line] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "LINE OA",
        externalId: `@fu-${suffix}`,
      })
      .returning();
    lineChannelId = line.id;
    const [fb] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "MESSENGER",
        displayName: "FB Page",
        externalId: `fb-${suffix}`,
      })
      .returning();
    fbChannelId = fb.id;

    const customer = await createCustomer(db, tenantId, { displayName: "C" });
    customerId = customer.id;
    // Customer identities on both channels (recipient lookup).
    await db.insert(customerIdentities).values([
      { tenantId, customerId, channelId: lineChannelId, externalId: `U-${suffix}` },
      { tenantId, customerId, channelId: fbChannelId, externalId: `PSID-${suffix}` },
    ]);

    const open = await openConversation(db, tenantId, {
      customerId,
      channelId: lineChannelId,
    });
    openConvoId = open.id;
    await recordInboundMessage(db, tenantId, openConvoId, { body: "hi" }); // opens window

    const stale = await openConversation(db, tenantId, {
      customerId,
      channelId: lineChannelId,
    });
    staleConvoId = stale.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("gates each follow-up correctly and only sends allowed ones", async () => {
    const past = new Date(Date.now() - 60_000);

    // A) promotional, window OPEN, LINE → SENT
    const a = await scheduleFollowup(db, tenantId, {
      customerId,
      conversationId: openConvoId,
      channelId: lineChannelId,
      category: "PROMOTIONAL",
      scheduledAt: past,
      payload: { text: "โปรใหม่มาแล้วค่ะ" },
    });
    // B) transactional, window CLOSED, LINE → SENT (post-purchase)
    const b = await scheduleFollowup(db, tenantId, {
      customerId,
      conversationId: staleConvoId,
      channelId: lineChannelId,
      category: "TRANSACTIONAL",
      scheduledAt: past,
      payload: { text: "พัสดุจัดส่งแล้วค่ะ" },
    });
    // C) promotional, window CLOSED, MESSENGER → SKIPPED
    const c = await scheduleFollowup(db, tenantId, {
      customerId,
      channelId: fbChannelId,
      category: "PROMOTIONAL",
      scheduledAt: past,
      payload: { text: "ลดราคาพิเศษ" },
    });

    const sent: { channelId: string; text: string }[] = [];
    const push: PushFn = async ({ channelId, text }) => {
      sent.push({ channelId, text });
    };

    const res = await processDueFollowups(db, { push, now: new Date() });
    expect(res.processed).toBeGreaterThanOrEqual(3);
    expect(res.sent).toBe(2);
    expect(res.skipped).toBeGreaterThanOrEqual(1);

    // Only A and B were actually pushed.
    expect(sent).toHaveLength(2);
    expect(sent.every((s) => s.channelId === lineChannelId)).toBe(true);

    const rows = await db
      .select()
      .from(followups)
      .where(eq(followups.tenantId, tenantId));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a.id)?.status).toBe("SENT");
    expect(byId.get(a.id)?.windowCheckPassed).toBe(true);
    expect(byId.get(b.id)?.status).toBe("SENT");
    expect(byId.get(c.id)?.status).toBe("SKIPPED");
    expect(byId.get(c.id)?.reason).toBe("promotional_needs_optin");
  });

  it("does not resend an already-sent follow-up", async () => {
    const push: PushFn = async () => {};
    const res = await processDueFollowups(db, { push, now: new Date() });
    expect(res.sent).toBe(0); // nothing left in SCHEDULED
  });
});
