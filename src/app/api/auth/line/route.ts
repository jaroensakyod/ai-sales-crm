import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { lineAuthUrl } from "@/features/auth/social";

// Start LINE Login. Generates a CSRF state, stashes it in a short-lived cookie,
// and redirects to LINE's authorize page. Falls back to a message when the
// platform hasn't configured a LINE Login channel yet.
export function GET(req: Request) {
  const base = new URL(req.url).origin;
  const state = randomBytes(16).toString("hex");
  const url = lineAuthUrl(state);
  if (!url) return NextResponse.redirect(`${base}/login?error=notconfigured`);
  const res = NextResponse.redirect(url);
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
