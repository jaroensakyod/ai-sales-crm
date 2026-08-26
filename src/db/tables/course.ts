import {
  boolean,
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
 * A course / class / membership cohort — priced with a limited number of seats.
 * `schedule` is free text the AI relays ("ทุกเสาร์ 10:00-12:00"); `capacity` is
 * how many students can enrol before it's full.
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    description: text("description"),
    // Deep knowledge the AI reads to answer questions about this course — kept
    // separate from the short `description` shown on cards (same split as products).
    aiKnowledge: text("ai_knowledge"),
    schedule: text("schedule"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("THB"),
    capacity: integer("capacity").notNull().default(20),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("courses_tenant_idx").on(t.tenantId)],
);

/** One student's seat in a course. Reuses appointmentStatusEnum
 *  (PENDING/CONFIRMED/CANCELLED/COMPLETED). */
export const courseEnrollments = pgTable(
  "course_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    courseId: uuid("course_id").references(() => courses.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    status: appointmentStatusEnum("status").notNull().default("PENDING"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("course_enrollments_tenant_idx").on(t.tenantId, t.courseId)],
);
