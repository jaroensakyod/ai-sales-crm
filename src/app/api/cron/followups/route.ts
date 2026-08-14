import { createDbClient } from "@/db/client";
import { processDueFollowups } from "@/features/followup/engine";

// Vercel Cron hits this on a schedule (docs require Vercel Pro for sub-daily
// cron). Protected by CRON_SECRET so it can't be triggered by the public.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const db = createDbClient();
  const result = await processDueFollowups(db);
  return Response.json({ ok: true, ...result });
}
