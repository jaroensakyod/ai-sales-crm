import { and, asc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { tenants, users } from "@/db/schema";

export async function createTenant(
  db: DbClient,
  input: { name: string; slug: string },
) {
  const [row] = await db.insert(tenants).values(input).returning();
  return row;
}

export async function getTenantBySlug(db: DbClient, slug: string) {
  const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  return row ?? null;
}

/** Cascade-deletes every tenant-scoped row (used in tests + tenant offboarding). */
export async function deleteTenant(db: DbClient, tenantId: string) {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

export async function createUser(
  db: DbClient,
  tenantId: string,
  input: { email: string; name?: string; role?: (typeof users.role.enumValues)[number] },
) {
  const [row] = await db
    .insert(users)
    .values({ ...input, tenantId })
    .onConflictDoNothing({ target: [users.tenantId, users.email] })
    .returning();
  return row ?? null;
}

export async function listUsers(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.createdAt));
}

export async function updateUserRole(
  db: DbClient,
  tenantId: string,
  userId: string,
  role: (typeof users.role.enumValues)[number],
) {
  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
}

export async function removeUser(
  db: DbClient,
  tenantId: string,
  userId: string,
) {
  await db
    .delete(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
}
