import { createDbClient } from "@/db/client";
import { processDueWebhooks } from "@/features/webhooks/engine";

// Flushes pending outbound-webhook deliveries (POST + retry with backoff).
// Runs on a schedule like the follow-up cron; protected by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const db = createDbClient();
  const result = await processDueWebhooks(db);
  return Response.json({ ok: true, ...result });
}
