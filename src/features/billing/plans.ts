import type { planEnum } from "@/db/schema";

export type Plan = (typeof planEnum.enumValues)[number];

export type Entitlements = {
  /** Max connected channels (Starter = 1, Pro = many — docs/03). */
  maxChannels: number;
  /** Automated follow-up + cross-sell (Pro only). */
  followupAutomation: boolean;
  /** Full analytics + objection breakdown (Pro only). */
  fullAnalytics: boolean;
};

/** Monthly price in THB (see the pricing plan). */
export const PLAN_PRICE_THB: Record<Plan, number> = {
  FREE: 0,
  STARTER: 290,
  PRO: 590,
  BUSINESS: 990,
};

export function planEntitlements(plan: Plan): Entitlements {
  switch (plan) {
    case "BUSINESS":
    case "PRO":
      return { maxChannels: 99, followupAutomation: true, fullAnalytics: true };
    case "STARTER":
      return { maxChannels: 2, followupAutomation: false, fullAnalytics: false };
    case "FREE":
    default:
      return { maxChannels: 1, followupAutomation: false, fullAnalytics: false };
  }
}
