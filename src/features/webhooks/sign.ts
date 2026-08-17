import { createHmac } from "node:crypto";

/**
 * Sign an outbound webhook body so the receiver can verify it came from us.
 * Sent in the X-Webhook-Signature header as "sha256=<hex>", computed over the
 * exact raw JSON body with the endpoint's secret — the same scheme Meta/GitHub
 * use, so merchants can verify with standard libraries.
 */
export function computeWebhookSignature(secret: string, rawBody: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}
