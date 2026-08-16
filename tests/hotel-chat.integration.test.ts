import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createRoom } from "@/db/repositories/hotel";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { customers, hotelBookings } from "@/db/schema";
import { tryHotelBooking } from "@/features/hotel/book-from-chat";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("hotel booking from chat (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const now = new Date("2026-10-01T02:00:00Z"); // 09:00 Bangkok

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, { name: "Hotel", slug: `hotel-${suffix}` });
    tenantId = tenant.id;
    await createRoom(db, tenantId, {
      name: "ห้องดีลักซ์",
      pricePerNight: "1200",
      quantity: 2,
    });
    await createRoom(db, tenantId, {
      name: "ห้องสแตนดาร์ด",
      pricePerNight: "800",
      quantity: 3,
    });
    const [c] = await db
      .insert(customers)
      .values({ tenantId, displayName: "แขก" })
      .returning();
    customerId = c.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  const ctx = (text: string) => ({ tenantId, customerId, text, now });

  it("answers an availability question with rooms + rates", async () => {
    const res = await tryHotelBooking(db, ctx("มีห้องว่างคืนนี้ไหมคะ"));
    expect(res?.reply).toContain("ห้องดีลักซ์");
    expect(res?.reply).toContain("1,200");
    expect(res?.reply).toContain("ห้องสแตนดาร์ด");
  });

  it("books a room for a date range and computes the nightly total", async () => {
    const res = await tryHotelBooking(db, ctx("จองห้องดีลักซ์พรุ่งนี้ 2 คืน"));
    expect(res?.bookingId).toBeTruthy();
    expect(res?.reply).toContain("2,400"); // 2 nights x 1200
    const rows = await db
      .select()
      .from(hotelBookings)
      .where(eq(hotelBookings.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0].checkIn).toBe("2026-10-02");
    expect(rows[0].checkOut).toBe("2026-10-04");
    expect(rows[0].nights).toBe(2);
  });

  it("never overbooks past the room-type quantity", async () => {
    // Deluxe has quantity 2; one is already booked above for these dates.
    const second = await tryHotelBooking(db, ctx("จองห้องดีลักซ์พรุ่งนี้ 2 คืน"));
    expect(second?.bookingId).toBeTruthy(); // 2nd of 2 — ok
    const third = await tryHotelBooking(db, ctx("จองห้องดีลักซ์พรุ่งนี้ 2 คืน"));
    expect(third?.bookingId).toBeUndefined(); // full
    expect(third?.reply).toContain("เต็มแล้ว");
  });

  it("asks for dates when a room is named without them", async () => {
    const res = await tryHotelBooking(db, ctx("จองห้องสแตนดาร์ด"));
    expect(res?.bookingId).toBeUndefined();
    expect(res?.reply).toContain("เข้าพักวันไหน");
  });
});
