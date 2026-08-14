import { createDbClient } from "@/db/client";
import { processPaymentWebhook } from "@/features/payment/webhook";

// Payment provider callback endpoint. Secured by PAYMENT_WEBHOOK_SECRET
// (Authorization: Bearer <secret>). Only a verified callback marks an order PAID.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  const db = createDbClient();
  const result = await processPaymentWebhook(db, rawBody, signature);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({
    ok: true,
    orderPaid: result.orderPaid,
    alreadyConfirmed: result.alreadyConfirmed,
  });
}
