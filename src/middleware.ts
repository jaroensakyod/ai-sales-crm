import { NextResponse } from "next/server";

/**
 * Login is temporarily DISABLED — the dashboard is open. This middleware is a
 * no-op. To re-enable the super-admin gate, restore the DASHBOARD_PASSWORD check
 * and set the matcher back to ["/dashboard", "/dashboard/new"].
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
