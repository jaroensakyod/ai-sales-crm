import { NextResponse } from "next/server";

// Sign the owner out — clear the owner session cookie and go home.
export function GET(req: Request) {
  const base = new URL(req.url).origin;
  const res = NextResponse.redirect(`${base}/`);
  res.cookies.delete("owner_session");
  return res;
}
