import { createHmac } from "node:crypto";

import { safeEqual } from "@/lib/crypto";

/**
 * Meta signs webhook payloads with the APP secret (app-level, shared across all
 * pages) in the X-Hub-Signature-256 header: "sha256=<hex hmac of raw body>".
 */
export function computeFacebookSignature(
  appSecret: string,
  rawBody: string,
): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function verifyFacebookSignature(
  appSecret: string,
  rawBody: string,
  header: string | null | undefined,
): boolean {
  if (!header) return false;
  return safeEqual(computeFacebookSignature(appSecret, rawBody), header);
}
