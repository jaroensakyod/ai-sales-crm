import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";

/** The 3 core data structures a tenant can mix (docs/01-summary.md). */
export const businessTypeEnum = pgEnum("business_type", [
  "CATALOG", // product/price/stock/variant/shipping
  "BOOKING", // resource + time_slot + duration
  "COURSE", // course/session + cohort + recurring billing
  "HOTEL", // room types + nightly rates + date-range availability
]);

export const tenantStatusEnum = pgEnum("tenant_status", [
  "ACTIVE",
  "SUSPENDED",
  "TRIAL",
]);

export const userRoleEnum = pgEnum("user_role", [
  "OWNER",
  "ADMIN",
  "SALES",
  "SUPPORT",
  "VIEWER",
]);

/**
 * Root of the multi-tenant tree. The ONLY table without a tenant_id.
 * Everything else references tenants.id and cascades on delete.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: tenantStatusEnum("status").notNull().default("TRIAL"),
  // Multi-select: a restaurant is CATALOG + BOOKING, etc.
  businessTypes: businessTypeEnum("business_types")
    .array()
    .notNull()
    .default(sql`'{}'`),
  ...timestamps,
});

/**
 * Shared tenant foreign-key column. Use in every other table:
 *   tenantId: tenantId(),
 * Enforces the isolation invariant at the schema level (risk #8).
 */
export const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("VIEWER"),
    // scrypt hash ("scrypt$salt$hash"); null until the user sets a password.
    passwordHash: text("password_hash"),
    ...timestamps,
  },
  (t) => [
    unique("users_tenant_email_uq").on(t.tenantId, t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);
