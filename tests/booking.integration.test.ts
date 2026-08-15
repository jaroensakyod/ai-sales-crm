import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  createAppointment,
  createService,
  listAppointments,
  setAppointmentStatus,
} from "@/db/repositories/booking";
import { createCustomer } from "@/db/repositories/customers";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { bookingServices } from "@/db/schema";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("booking (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  let serviceId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Salon",
      slug: `book-${suffix}`,
    });
    tenantId = tenant.id;
    const customer = await createCustomer(db, tenantId, { displayName: "C" });
    customerId = customer.id;
    await createService(db, tenantId, {
      name: "ตัดผม",
      durationMin: 60,
      price: "300",
    });
    const [svc] = await db
      .select()
      .from(bookingServices)
      .where(eq(bookingServices.tenantId, tenantId));
    serviceId = svc.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("books a slot, then rejects an overlapping one (no double-booking)", async () => {
    const start = new Date("2026-06-01T03:00:00Z");
    const end = new Date("2026-06-01T04:00:00Z");
    const first = await createAppointment(db, tenantId, {
      serviceId,
      customerId,
      startAt: start,
      endAt: end,
    });
    expect(first.ok).toBe(true);

    // Overlapping (03:30–04:30) → rejected.
    const clash = await createAppointment(db, tenantId, {
      serviceId,
      customerId,
      startAt: new Date("2026-06-01T03:30:00Z"),
      endAt: new Date("2026-06-01T04:30:00Z"),
    });
    expect(clash.ok).toBe(false);

    // Non-overlapping (04:00–05:00) → allowed.
    const next = await createAppointment(db, tenantId, {
      serviceId,
      customerId,
      startAt: new Date("2026-06-01T04:00:00Z"),
      endAt: new Date("2026-06-01T05:00:00Z"),
    });
    expect(next.ok).toBe(true);
  });

  it("frees the slot when the appointment is cancelled", async () => {
    const appts = await listAppointments(db, tenantId);
    const one = appts[0];
    await setAppointmentStatus(db, tenantId, one.id, "CANCELLED");

    // Now an overlapping booking at that time is allowed again.
    const rebook = await createAppointment(db, tenantId, {
      serviceId,
      customerId,
      startAt: new Date(one.startAt),
      endAt: new Date(one.endAt),
    });
    expect(rebook.ok).toBe(true);
  });
});
