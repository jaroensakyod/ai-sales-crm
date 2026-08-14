import type { DbClient } from "@/db/client";
import { getUserByEmail, getTenantBySlug } from "@/db/repositories/tenants";
import { verifyPassword } from "@/lib/password";
import type { SessionPayload } from "@/lib/session";

/**
 * Authenticate a store staff member (per-tenant login). Returns the session
 * payload on success, or null on any failure (unknown tenant/user, no password
 * set, wrong password) — callers must not distinguish the reasons to the user.
 */
export async function authenticate(
  db: DbClient,
  tenantSlug: string,
  email: string,
  password: string,
): Promise<Omit<SessionPayload, "exp"> | null> {
  const tenant = await getTenantBySlug(db, tenantSlug);
  if (!tenant) return null;

  const user = await getUserByEmail(db, tenant.id, email.trim().toLowerCase());
  if (!user?.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  return {
    userId: user.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    role: user.role,
  };
}
