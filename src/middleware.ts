import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Minimal dashboard gate. When DASHBOARD_PASSWORD is set, every /dashboard route
 * requires a matching `dash` cookie; otherwise redirect to the login form. With
 * no password set (local dev) the dashboard is open.
 *
 * NOTE: this is a single shared password for Phase 1 internal use. Real
 * multi-tenant auth (per-user login, roles) is a later step.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/dashboard/login") return NextResponse.next();

  if (req.cookies.get("dash")?.value === password) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/dashboard/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
