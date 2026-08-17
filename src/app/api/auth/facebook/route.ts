import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { facebookAuthUrl } from "@/features/auth/social";

// Start Facebook Login. Same CSRF-state pattern as LINE; falls back to a message
// when the platform hasn't configured Facebook Login yet.
export function GET(req: Request) {
  const base = new URL(req.url).origin;
  const state = randomBytes(16).toString("hex");
  const url = facebookAuthUrl(state);
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
