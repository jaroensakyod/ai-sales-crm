import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createService } from "@/db/repositories/booking";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { appointments, customers } from "@/db/schema";
import { tryBooking } from "@/features/booking/book-from-chat";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("booking from chat (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // Fixed "now" so the parsed slot is deterministic (08:00 Bangkok).
  const now = new Date("2026-09-01T01:00:00Z");

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, { name: "Spa", slug: `spa-${suffix}` });
    tenantId = tenant.id;
    await createService(db, tenantId, {
      name: "นวดแผนไทย",
      durationMin: 60,
      price: "400",
    });
    const [c] = await db
      .insert(customers)
      .values({ tenantId, displayName: "ลูกค้าทดสอบ" })
      .returning();
    customerId = c.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  const ctx = (text: string) => ({
    tenantId,
    customerId,
    conversationId: "00000000-0000-0000-0000-000000000000",
    text,
    now,
  });

  it("creates a real appointment on a clear booking", async () => {
    const res = await tryBooking(db, ctx("จองนวดแผนไทยพรุ่งนี้บ่าย 2 โมง"));
    expect(res?.appointmentId).toBeTruthy();
    expect(res?.reply).toContain("จองนวดแผนไทยเรียบร้อย");

    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    // 14:00 Bangkok tomorrow (2026-09-02) = 07:00 UTC.
    expect(rows[0].startAt.toISOString()).toBe("2026-09-02T07:00:00.000Z");
    expect(rows[0].status).toBe("PENDING");
  });

  it("rejects a double-booking of the same slot", async () => {
    const res = await tryBooking(db, ctx("จองนวดแผนไทยพรุ่งนี้บ่าย 2 โมง"));
    expect(res?.appointmentId).toBeUndefined();
    expect(res?.reply).toContain("เต็มแล้ว");
  });

  it("asks for a time when the service is clear but time is missing", async () => {
    const res = await tryBooking(db, ctx("อยากจองนวดแผนไทย"));
    expect(res?.appointmentId).toBeUndefined();
    expect(res?.reply).toContain("สะดวกวันและเวลาไหน");
  });

  it("returns null (lets the AI handle) when no service is named", async () => {
    expect(await tryBooking(db, ctx("จองพรุ่งนี้บ่าย 2 โมง"))).toBeNull();
  });
});
