import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { signSession, verifySession, type SessionPayload } from "@/lib/session";
import { roleCan, type Permission, type Role } from "@/features/team/roles";

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

/** Require a valid session for this tenant; redirect to its login otherwise. */
export async function requireTenantAuth(slug: string): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.tenantSlug !== slug) {
    redirect(`/dashboard/${slug}/login`);
  }
  return session;
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
