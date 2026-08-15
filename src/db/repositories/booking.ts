import { and, asc, desc, eq, inArray, lt, gt } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { appointments, bookingServices, customers } from "@/db/schema";

// ---- Services ------------------------------------------------------------

export async function listServices(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(bookingServices)
    .where(eq(bookingServices.tenantId, tenantId))
    .orderBy(asc(bookingServices.name));
}

export async function createService(
  db: DbClient,
  tenantId: string,
  input: {
    name: string;
    durationMin: number;
    price: string;
    description?: string | null;
  },
) {
  await db.insert(bookingServices).values({ tenantId, ...input });
}

export async function deleteService(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(bookingServices)
    .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.id, id)));
}

export async function getService(db: DbClient, tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(bookingServices)
    .where(and(eq(bookingServices.tenantId, tenantId), eq(bookingServices.id, id)));
  return row ?? null;
}

// ---- Appointments --------------------------------------------------------

export type BookResult =
  | { ok: true; appointmentId: string }
  | { ok: false; reason: "slot_taken" };

/**
 * Create an appointment, rejecting a double-booking: no overlapping PENDING/
 * CONFIRMED appointment may exist for the same service. Overlap = existing
 * starts before the new end AND ends after the new start.
 */
export async function createAppointment(
  db: DbClient,
  tenantId: string,
  input: {
    serviceId?: string | null;
    customerId: string;
    startAt: Date;
    endAt: Date;
    note?: string | null;
  },
): Promise<BookResult> {
  if (input.serviceId) {
    const clashes = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.serviceId, input.serviceId),
          inArray(appointments.status, ["PENDING", "CONFIRMED"]),
          lt(appointments.startAt, input.endAt),
          gt(appointments.endAt, input.startAt),
        ),
      )
      .limit(1);
    if (clashes.length > 0) return { ok: false, reason: "slot_taken" };
  }

  const [row] = await db
    .insert(appointments)
    .values({ tenantId, ...input })
    .returning();
  return { ok: true, appointmentId: row.id };
}

export async function listAppointments(
  db: DbClient,
  tenantId: string,
  limit = 100,
) {
  return db
    .select({
      id: appointments.id,
      startAt: appointments.startAt,
      endAt: appointments.endAt,
      status: appointments.status,
      note: appointments.note,
      customerName: customers.displayName,
      serviceName: bookingServices.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .leftJoin(bookingServices, eq(bookingServices.id, appointments.serviceId))
    .where(eq(appointments.tenantId, tenantId))
    .orderBy(desc(appointments.startAt))
    .limit(limit);
}

export async function setAppointmentStatus(
  db: DbClient,
  tenantId: string,
  id: string,
  status: (typeof appointments.status.enumValues)[number],
) {
  await db
    .update(appointments)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)));
}
