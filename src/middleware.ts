import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Super-admin gate for the cross-tenant pages (store list + create store).
 * When DASHBOARD_PASSWORD is set they require the `dash` cookie; open in dev.
 *
 * Per-tenant pages (/dashboard/[slug]/*) are NOT gated here — they use per-user
 * login enforced by requireTenantAuth in the pages themselves.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  if (req.cookies.get("dash")?.value === password) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/dashboard/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Only the super-admin pages; tenant pages handle their own auth.
  matcher: ["/dashboard", "/dashboard/new"],
};
