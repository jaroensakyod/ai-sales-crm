import { NextResponse } from "next/server";

// Set the super-admin cookie when the shared DASHBOARD_PASSWORD matches.
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  const base = new URL(req.url).origin;

  if (!expected || password !== expected) {
    return NextResponse.redirect(`${base}/admin/login?error=1`, 303);
  }
  const res = NextResponse.redirect(`${base}/admin`, 303);
  res.cookies.set("admin", password, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 3600,
  });
  return res;
}

// Sign out of the admin console.
export function GET(req: Request) {
  const base = new URL(req.url).origin;
  const res = NextResponse.redirect(`${base}/admin/login`, 303);
  res.cookies.delete("admin");
  return res;
}
