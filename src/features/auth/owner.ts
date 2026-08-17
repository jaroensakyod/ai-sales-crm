import { cookies } from "next/headers";

import {
  signOwnerSession,
  verifyOwnerSession,
  type OwnerSession,
} from "@/lib/session";

const OWNER_COOKIE = "owner_session";
const MAX_AGE = 7 * 24 * 60 * 60;

export async function setOwnerCookie(
  payload: Omit<OwnerSession, "exp">,
): Promise<void> {
  (await cookies()).set(OWNER_COOKIE, signOwnerSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearOwnerCookie(): Promise<void> {
  (await cookies()).delete(OWNER_COOKIE);
}

export async function getOwnerSession(): Promise<OwnerSession | null> {
  return verifyOwnerSession((await cookies()).get(OWNER_COOKIE)?.value);
}
