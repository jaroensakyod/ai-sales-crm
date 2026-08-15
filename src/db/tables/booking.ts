import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { customers } from "./customers";
import { tenantId } from "./tenants";

/** A bookable service (haircut, consult, class session…) — the BOOKING/COURSE
 *  analogue of a product: priced by a time slot rather than stock. */
export const bookingServices = pgTable(
  "booking_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    description: text("description"),
    durationMin: integer("duration_min").notNull().default(60),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("THB"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("booking_services_tenant_idx").on(t.tenantId)],
);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
]);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    serviceId: uuid("service_id").references(() => bookingServices.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: appointmentStatusEnum("status").notNull().default("PENDING"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("appointments_tenant_start_idx").on(t.tenantId, t.startAt)],
);
