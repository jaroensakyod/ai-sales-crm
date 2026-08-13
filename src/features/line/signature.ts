import { createHmac } from "node:crypto";

import { safeEqual } from "@/lib/crypto";

/**
 * LINE webhook signature = base64( HMAC-SHA256(channelSecret, rawRequestBody) ).
 * Must be computed over the EXACT raw body bytes, before any JSON parsing.
 */
export function computeLineSignature(
  channelSecret: string,
  rawBody: string,
): string {
  return createHmac("sha256", channelSecret).update(rawBody).digest("base64");
}

export function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  return safeEqual(computeLineSignature(channelSecret, rawBody), signature);
}
