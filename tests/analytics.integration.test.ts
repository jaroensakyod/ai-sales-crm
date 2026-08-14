import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import { openConversation, setConversationStatus } from "@/db/repositories/conversations";
import { getTenantOverview } from "@/db/repositories/analytics";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { aiRuns, channels, orders } from "@/db/schema";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("analytics overview (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Stats Store",
      slug: `stats-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "S" });
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@s-${suffix}`,
      })
      .returning();

    const convo = await openConversation(db, tenantId, {
      customerId: customer.id,
      channelId: channel.id,
    });
    await setConversationStatus(db, tenantId, convo.id, "HANDOFF");

    await db.insert(orders).values([
      { tenantId, customerId: customer.id, status: "PAID", total: "1070" },
      { tenantId, customerId: customer.id, status: "PENDING_PAYMENT", total: "290" },
    ]);
    await db.insert(aiRuns).values([
      { tenantId, model: "gemini-flash-latest", routerLevel: 3, costUsd: "0.001200" },
      { tenantId, model: "gemini-flash-lite-latest", routerLevel: 2, costUsd: "0.000300" },
      { tenantId, model: "gemini-flash-latest", routerLevel: 3, costUsd: "0.001000" },
    ]);
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("aggregates conversations, orders, revenue, and AI cost", async () => {
    const o = await getTenantOverview(db, tenantId);
    expect(o.conversations.handoff).toBe(1);
    expect(o.orders.paid).toBe(1);
    expect(o.orders.pending).toBe(1);
    expect(o.orders.revenue).toBeCloseTo(1070, 2);
    expect(o.ai.calls).toBe(3);
    expect(o.ai.costUsd).toBeCloseTo(0.0025, 6);
    expect(o.ai.byLevel[3]).toBe(2);
    expect(o.ai.byLevel[2]).toBe(1);
  });
});
