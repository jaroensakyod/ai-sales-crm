import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import { createRule } from "@/db/repositories/automation";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { followups } from "@/db/schema";
import { runAutomations } from "@/features/automation/engine";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("automation engine (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Auto Store",
      slug: `auto-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "A" });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("ORDER_PAID rule schedules a follow-up at the configured delay", async () => {
    await createRule(db, tenantId, {
      name: "thank you",
      trigger: { type: "ORDER_PAID" },
      action: {
        type: "SCHEDULE_FOLLOWUP",
        delayHours: 72,
        message: "ขอบคุณที่อุดหนุนค่ะ 🙏",
        category: "PROMOTIONAL",
      },
    });
    // An inactive / different-trigger rule must NOT fire.
    await createRule(db, tenantId, {
      name: "on create",
      trigger: { type: "ORDER_CREATED" },
      action: {
        type: "SCHEDULE_FOLLOWUP",
        delayHours: 1,
        message: "created",
        category: "TRANSACTIONAL",
      },
    });

    const now = new Date("2026-01-01T00:00:00Z");
    const queued = await runAutomations(
      db,
      tenantId,
      "ORDER_PAID",
      { customerId },
      now,
    );
    expect(queued).toBe(1);

    const rows = await db
      .select()
      .from(followups)
      .where(eq(followups.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect((rows[0].payload as { text: string }).text).toContain("ขอบคุณ");
    expect(rows[0].category).toBe("PROMOTIONAL");
    // scheduled 72h after `now`
    const expected = new Date(now.getTime() + 72 * 3600 * 1000).getTime();
    expect(new Date(rows[0].scheduledAt).getTime()).toBe(expected);
  });
});
