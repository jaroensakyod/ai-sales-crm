import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customers, hotelBookings, hotelRooms } from "@/db/schema";

// ---- Room types ----------------------------------------------------------

export async function listRooms(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(hotelRooms)
    .where(eq(hotelRooms.tenantId, tenantId))
    .orderBy(asc(hotelRooms.pricePerNight));
}

export async function createRoom(
  db: DbClient,
  tenantId: string,
  input: {
    name: string;
    pricePerNight: string;
    quantity: number;
    capacity?: number;
    description?: string | null;
    imageUrl?: string | null;
  },
) {
  await db.insert(hotelRooms).values({ tenantId, ...input });
}

export async function deleteRoom(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(hotelRooms)
    .where(and(eq(hotelRooms.tenantId, tenantId), eq(hotelRooms.id, id)));
}

// ---- Availability --------------------------------------------------------

/**
 * How many rooms of a type are free for [checkIn, checkOut). Overlap = an active
 * booking that starts before the new checkout AND ends after the new check-in.
 */
export async function countAvailable(
  db: DbClient,
  tenantId: string,
  room: { id: string; quantity: number },
  checkIn: string,
  checkOut: string,
): Promise<number> {
  const overlaps = await db
    .select({ id: hotelBookings.id })
    .from(hotelBookings)
    .where(
      and(
        eq(hotelBookings.tenantId, tenantId),
        eq(hotelBookings.roomId, room.id),
        inArray(hotelBookings.status, ["PENDING", "CONFIRMED"]),
        lt(hotelBookings.checkIn, checkOut),
        gt(hotelBookings.checkOut, checkIn),
      ),
    );
  return room.quantity - overlaps.length;
}

/** All room types with at least one room free for the date range. */
export async function listAvailableRooms(
  db: DbClient,
  tenantId: string,
  checkIn: string,
  checkOut: string,
) {
  const rooms = await listRooms(db, tenantId);
  const out: { room: (typeof rooms)[number]; available: number }[] = [];
  for (const room of rooms) {
    if (!room.isActive) continue;
    const available = await countAvailable(db, tenantId, room, checkIn, checkOut);
    if (available > 0) out.push({ room, available });
  }
  return out;
}

// ---- Bookings ------------------------------------------------------------

export type HotelBookingResult =
  | { ok: true; bookingId: string; totalPrice: number }
  | { ok: false; reason: "full" };

/**
 * Create a stay, re-checking availability first so we never overbook a room type
 * past its quantity. Total = nights × nightly rate (server-computed, never the
 * AI's number).
 */
export async function createHotelBooking(
  db: DbClient,
  tenantId: string,
  input: {
    room: { id: string; quantity: number; pricePerNight: string };
    customerId: string;
    conversationId?: string | null;
    checkIn: string;
    checkOut: string;
    nights: number;
    guests?: number;
  },
): Promise<HotelBookingResult> {
  const available = await countAvailable(
    db,
    tenantId,
    input.room,
    input.checkIn,
    input.checkOut,
  );
  if (available < 1) return { ok: false, reason: "full" };

  const totalPrice = input.nights * Number(input.room.pricePerNight);
  const [row] = await db
    .insert(hotelBookings)
    .values({
      tenantId,
      roomId: input.room.id,
      customerId: input.customerId,
      conversationId: input.conversationId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: input.nights,
      guests: input.guests ?? 1,
      totalPrice: totalPrice.toFixed(2),
    })
    .returning();
  return { ok: true, bookingId: row.id, totalPrice };
}

export async function listHotelBookings(db: DbClient, tenantId: string, limit = 100) {
  return db
    .select({
      id: hotelBookings.id,
      checkIn: hotelBookings.checkIn,
      checkOut: hotelBookings.checkOut,
      nights: hotelBookings.nights,
      guests: hotelBookings.guests,
      totalPrice: hotelBookings.totalPrice,
      status: hotelBookings.status,
      roomName: hotelRooms.name,
      customerName: customers.displayName,
    })
    .from(hotelBookings)
    .leftJoin(hotelRooms, eq(hotelBookings.roomId, hotelRooms.id))
    .leftJoin(customers, eq(hotelBookings.customerId, customers.id))
    .where(eq(hotelBookings.tenantId, tenantId))
    .orderBy(desc(hotelBookings.checkIn))
    .limit(limit);
}
