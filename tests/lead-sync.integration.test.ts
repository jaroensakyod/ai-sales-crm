import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import { openConversation, recordInboundMessage } from "@/db/repositories/conversations";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels, leads, objections } from "@/db/schema";
import { syncLeadOnInbound } from "@/features/sales/lead-sync";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("lead sync on inbound (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  let conversationId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Sync Store",
      slug: `sync-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "Sync" });
    customerId = customer.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@sync-${suffix}`,
      })
      .returning();
    const convo = await openConversation(db, tenantId, {
      customerId,
      channelId: channel.id,
    });
    conversationId = convo.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("creates a lead, records a price objection, and scores", async () => {
    await recordInboundMessage(db, tenantId, conversationId, {
      body: "แพงจังเลย ลดได้ไหม",
      channelMessageId: `s1-${suffix}`,
    });

    const res = await syncLeadOnInbound(db, {
      tenantId,
      customerId,
      conversationId,
      text: "แพงจังเลย ลดได้ไหม",
    });
    expect(res.objection).toBe("PRICE");
    expect(res.score).toBeGreaterThanOrEqual(0);

    const leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.tenantId, tenantId));
    expect(leadRows).toHaveLength(1);

    const objRows = await db
      .select()
      .from(objections)
      .where(eq(objections.tenantId, tenantId));
    expect(objRows.some((o) => o.type === "PRICE")).toBe(true);
  });

  it("is idempotent on the lead (second inbound reuses it)", async () => {
    const res = await syncLeadOnInbound(db, {
      tenantId,
      customerId,
      conversationId,
      text: "สนใจสั่งซื้อค่ะ",
    });
    expect(res.objection).toBeNull();

    const leadRows = await db
      .select()
      .from(leads)
      .where(eq(leads.tenantId, tenantId));
    expect(leadRows).toHaveLength(1); // still one lead
  });
});
