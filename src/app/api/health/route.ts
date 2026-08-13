import { NextResponse } from "next/server";

// Lightweight liveness probe. Does NOT touch the DB so it stays green even
// if Supabase/Gemini are down (Message Router Level 1-2 principle, risk #6).
export function GET() {
  return NextResponse.json({ status: "ok", service: "ai-sales-crm" });
}
