import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { appointmentStatusEnum } from "./booking";
import { conversations, customers } from "./customers";
import { tenantId } from "./tenants";

/**
 * A room TYPE (Deluxe, Superior…), not an individual room. `quantity` is how many
 * physical rooms of this type exist — availability = quantity minus the bookings
 * overlapping a date range. Priced per night.
 */
export const hotelRooms = pgTable(
  "hotel_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    description: text("description"),
    pricePerNight: numeric("price_per_night", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("THB"),
    quantity: integer("quantity").notNull().default(1),
    capacity: integer("capacity").notNull().default(2),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("hotel_rooms_tenant_idx").on(t.tenantId)],
);

/**
 * A stay: one room type for a date range [checkIn, checkOut). Dates are stored
 * date-only (no timezone) — a hotel night is a calendar day. Reuses
 * appointmentStatusEnum (PENDING/CONFIRMED/CANCELLED/COMPLETED).
 */
export const hotelBookings = pgTable(
  "hotel_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    roomId: uuid("room_id").references(() => hotelRooms.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    nights: integer("nights").notNull(),
    guests: integer("guests").notNull().default(1),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: appointmentStatusEnum("status").notNull().default("PENDING"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("hotel_bookings_tenant_idx").on(t.tenantId, t.checkIn)],
);
