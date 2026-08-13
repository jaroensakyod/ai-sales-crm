import { createDbClient } from "@/db/client";
import { processLineWebhook } from "@/features/line/webhook";

// Multi-tenant LINE webhook: each OA is configured with a URL carrying its own
// channelId, so one endpoint serves every tenant. The per-OA channel secret
// (encrypted in the DB) verifies the signature — no shared env secret.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await ctx.params;
  const rawBody = await req.text(); // must read raw bytes before JSON parse
  const signature = req.headers.get("x-line-signature");

  const db = createDbClient();
  const result = await processLineWebhook(db, channelId, rawBody, signature);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({
    ok: true,
    processed: result.processed,
    skipped: result.skipped,
  });
}
