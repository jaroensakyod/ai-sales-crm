import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { claimTenantOwner, getTenantBySlug } from "@/db/repositories/tenants";
import { signSession, verifySession, type SessionPayload } from "@/lib/session";
import { roleCan, type Permission, type Role } from "@/features/team/roles";

import { getOwnerSession } from "./owner";

const COOKIE = "session";
const MAX_AGE = 7 * 24 * 60 * 60;

export async function setSessionCookie(
  payload: Omit<SessionPayload, "exp">,
): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, signSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return verifySession(token);
}

export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "1" || process.env.AUTH_ENABLED === "true";
}

/** Local-only escape hatch. Set AUTH_DEV_BYPASS=1 to skip auth on your machine.
 *  NEVER set this in production — it opens every store to anyone. */
function devBypass(): boolean {
  return process.env.AUTH_DEV_BYPASS === "1";
}

/**
 * Require access to this tenant. Secure by default:
 *   - Owner (LINE/Facebook/email login) must OWN the store (tenants.ownerId).
 *     An orphan store with no owner is claimed by the first owner who opens it.
 *   - Otherwise a valid per-tenant staff `session` cookie for this slug.
 *   - Otherwise → /login.
 * The old "AUTH_ENABLED off ⇒ everyone is OWNER" default is gone (it exposed
 * every store to unauthenticated users); use AUTH_DEV_BYPASS locally instead.
 */
export async function requireTenantAuth(slug: string): Promise<SessionPayload> {
  if (devBypass()) {
    return {
      userId: "",
      tenantId: "",
      tenantSlug: slug,
      role: "OWNER",
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
  }

  const owner = await getOwnerSession();
  if (owner) {
    const db = createDbClient();
    const tenant = await getTenantBySlug(db, slug);
    if (!tenant) redirect("/dashboard");
    if (tenant.ownerId && tenant.ownerId !== owner.ownerId) {
      redirect("/dashboard"); // logged in, but this store isn't theirs
    }
    if (!tenant.ownerId) {
      await claimTenantOwner(db, tenant.id, owner.ownerId);
    }
    return {
      userId: owner.ownerId,
      tenantId: tenant.id,
      tenantSlug: slug,
      role: "OWNER",
      exp: owner.exp,
    };
  }

  // Staff (per-tenant) login.
  const session = await getSession();
  if (session && session.tenantSlug === slug) return session;

  redirect("/login");
}

/** Require a permission; bounce to the tenant overview if the role lacks it. */
export async function requirePermission(
  session: SessionPayload,
  permission: Permission,
): Promise<void> {
  if (!roleCan(session.role as Role, permission)) {
    redirect(`/dashboard/${session.tenantSlug}`);
  }
}
