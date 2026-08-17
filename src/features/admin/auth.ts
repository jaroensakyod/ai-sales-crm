import { cookies } from "next/headers";

import { safeEqual } from "@/lib/crypto";

const ADMIN_COOKIE = "admin";

/** True when the request carries the shared super-admin password cookie. */
export async function isAdmin(): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const got = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!got) return false;
  return safeEqual(got, expected);
}

export { ADMIN_COOKIE };
