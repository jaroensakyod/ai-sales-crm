import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  getLeadScoreStats,
  getObjectionBreakdown,
} from "@/db/repositories/analytics";
import { createCustomer } from "@/db/repositories/customers";
import { ensureLead, recordObjection, setLeadScore } from "@/db/repositories/leads";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("objection analytics (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Analytics Store",
      slug: `an-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "A" });
    const lead = await ensureLead(db, tenantId, { customerId: customer.id });
    await setLeadScore(db, tenantId, lead.id, 70);
    await recordObjection(db, tenantId, { leadId: lead.id, type: "PRICE" });
    await recordObjection(db, tenantId, { leadId: lead.id, type: "PRICE" });
    await recordObjection(db, tenantId, { leadId: lead.id, type: "TRUST" });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("groups objections by type, most common first", async () => {
    const breakdown = await getObjectionBreakdown(db, tenantId);
    expect(breakdown[0].type).toBe("PRICE");
    expect(breakdown[0].total).toBe(2);
    expect(breakdown.find((b) => b.type === "TRUST")?.total).toBe(1);
  });

  it("computes lead score stats", async () => {
    const stats = await getLeadScoreStats(db, tenantId);
    expect(stats.count).toBe(1);
    expect(stats.avgScore).toBe(70);
    expect(stats.hot).toBe(1); // >= 60
  });
});
