import { NextResponse } from "next/server";

import { createDbClient } from "@/db/client";
import { upsertOwner } from "@/db/repositories/owners";
import { exchangeLine } from "@/features/auth/social";
import { signOwnerSession } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
  if (!code || !state || state !== cookieState) {
    return NextResponse.redirect(`${base}/login?error=state`);
  }
  try {
    const profile = await exchangeLine(code);
    const owner = await upsertOwner(createDbClient(), profile);
    const token = signOwnerSession({
      ownerId: owner.id,
      name: owner.displayName ?? "ร้านของฉัน",
      provider: "LINE",
    });
    const res = NextResponse.redirect(`${base}/dashboard`);
    res.cookies.set("owner_session", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 3600,
    });
    res.cookies.delete("oauth_state");
    return res;
  } catch {
    return NextResponse.redirect(`${base}/login?error=oauth`);
  }
}
