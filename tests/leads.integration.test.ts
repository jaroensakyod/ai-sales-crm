import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import {
  ensureLead,
  moveLeadStage,
  recordObjection,
} from "@/db/repositories/leads";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { leadEvents, objections, salesStages } from "@/db/schema";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("leads (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Lead Store",
      slug: `lead-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "L" });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("ensureLead is idempotent per customer", async () => {
    const a = await ensureLead(db, tenantId, { customerId });
    const b = await ensureLead(db, tenantId, { customerId });
    expect(a.id).toBe(b.id);
  });

  it("moving stage records a lead event", async () => {
    const lead = await ensureLead(db, tenantId, { customerId });
    const [stage] = await db
      .insert(salesStages)
      .values({ tenantId, name: "Qualified", sortOrder: 1 })
      .returning();

    await moveLeadStage(db, tenantId, lead.id, stage.id);

    const events = await db
      .select()
      .from(leadEvents)
      .where(eq(leadEvents.leadId, lead.id));
    expect(events.some((e) => e.type === "stage_change")).toBe(true);
  });

  it("records a classified objection and links it to the lead", async () => {
    const lead = await ensureLead(db, tenantId, { customerId });
    await recordObjection(db, tenantId, {
      leadId: lead.id,
      type: "PRICE",
      detail: "แพงไป",
    });

    const rows = await db
      .select()
      .from(objections)
      .where(eq(objections.tenantId, tenantId));
    expect(rows.some((o) => o.type === "PRICE")).toBe(true);

    const events = await db
      .select()
      .from(leadEvents)
      .where(eq(leadEvents.leadId, lead.id));
    expect(events.some((e) => e.type === "objection")).toBe(true);
  });
});
