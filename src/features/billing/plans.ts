import type { planEnum } from "@/db/schema";

export type Plan = (typeof planEnum.enumValues)[number];

export type Entitlements = {
  /** Max connected channels (Free = 1, Starter = 2, Pro+ = many — docs/03). */
  maxChannels: number;
  /** Automated follow-up + cross-sell, incl. cart recovery / review (Pro+). */
  followupAutomation: boolean;
  /** Full analytics + objection breakdown + lead scoring (Pro+). */
  fullAnalytics: boolean;
  /** LINE promo broadcasts, scheduled + with banner (Pro+). */
  promoBroadcast: boolean;
  /** Course / membership module (Pro+). */
  courseModule: boolean;
  /** Hotel / room-booking module (Business only). */
  hotelModule: boolean;
  /** Outbound webhooks / API integration (Business only). */
  apiWebhooks: boolean;
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
      return {
        maxChannels: 99,
        followupAutomation: true,
        fullAnalytics: true,
        promoBroadcast: true,
        courseModule: true,
        hotelModule: true, // hotel is the Business-tier headline
        apiWebhooks: true,
      };
    case "PRO":
      return {
        maxChannels: 99,
        followupAutomation: true,
        fullAnalytics: true,
        promoBroadcast: true,
        courseModule: true,
        hotelModule: false,
        apiWebhooks: false,
      };
    case "STARTER":
      return {
        maxChannels: 2,
        followupAutomation: false,
        fullAnalytics: false,
        promoBroadcast: false,
        courseModule: false,
        hotelModule: false,
        apiWebhooks: false,
      };
    case "FREE":
    default:
      return {
        maxChannels: 1,
        followupAutomation: false,
        fullAnalytics: false,
        promoBroadcast: false,
        courseModule: false,
        hotelModule: false,
        apiWebhooks: false,
      };
  }
}
