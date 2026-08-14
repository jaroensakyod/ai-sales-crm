/**
 * Meta 24-hour messaging window gate (risk #1 — the most important rule).
 * Encodes the policy as a pure function so it's impossible to send a
 * promotional message outside the window on a channel that forbids it.
 *
 * Rules (docs/04-risks.md #1):
 *   1) customer messaged within 24h        → send anything
 *   2) outside the window:
 *      - transactional (order/shipping)    → allowed (post-purchase update)
 *      - promotional / re-engagement:
 *          · LINE   → allowed (push, counts quota — risk #4)
 *          · others → blocked (needs opt-in / Marketing Messages)
 */

export type FollowupCategory = "TRANSACTIONAL" | "PROMOTIONAL" | "CONVERSATIONAL";
export type FollowupChannelType =
  | "LINE"
  | "MESSENGER"
  | "INSTAGRAM"
  | "TIKTOK"
  | "WHATSAPP";

export type FollowupGate = { allowed: boolean; reason: string };

export function evaluateFollowupGate(args: {
  withinWindow: boolean;
  category: FollowupCategory;
  channelType: FollowupChannelType;
}): FollowupGate {
  if (args.withinWindow) {
    return { allowed: true, reason: "within_24h" };
  }
  if (args.category === "TRANSACTIONAL") {
    return { allowed: true, reason: "transactional_outside_window" };
  }
  // Promotional / conversational re-engagement outside the window.
  if (args.channelType === "LINE") {
    return { allowed: true, reason: "promotional_line_push" };
  }
  return { allowed: false, reason: "promotional_needs_optin" };
}
