import { describe, expect, it } from "vitest";

import { planEntitlements, PLAN_PRICE_THB } from "@/features/billing/plans";

describe("planEntitlements", () => {
  it("FREE = 1 channel, no automation; STARTER = 2 channels", () => {
    const free = planEntitlements("FREE");
    expect(free.maxChannels).toBe(1);
    expect(free.followupAutomation).toBe(false);
    expect(planEntitlements("STARTER").maxChannels).toBe(2);
  });
  it("PRO/BUSINESS allow many channels + automation + analytics", () => {
    for (const p of ["PRO", "BUSINESS"] as const) {
      const e = planEntitlements(p);
      expect(e.maxChannels).toBeGreaterThan(1);
      expect(e.followupAutomation).toBe(true);
      expect(e.fullAnalytics).toBe(true);
    }
  });
  it("promo broadcast + courses start at PRO; hotel is Business-only", () => {
    expect(planEntitlements("STARTER").promoBroadcast).toBe(false);
    expect(planEntitlements("STARTER").courseModule).toBe(false);
    expect(planEntitlements("PRO").promoBroadcast).toBe(true);
    expect(planEntitlements("PRO").courseModule).toBe(true);
    // Hotel + API webhooks are Business-tier — Pro must NOT include them.
    expect(planEntitlements("PRO").hotelModule).toBe(false);
    expect(planEntitlements("BUSINESS").hotelModule).toBe(true);
    expect(planEntitlements("FREE").hotelModule).toBe(false);
    expect(planEntitlements("PRO").apiWebhooks).toBe(false);
    expect(planEntitlements("BUSINESS").apiWebhooks).toBe(true);
  });
  it("prices ascend FREE < STARTER < PRO < BUSINESS", () => {
    expect(PLAN_PRICE_THB.STARTER).toBeGreaterThan(0);
    expect(PLAN_PRICE_THB.PRO).toBeGreaterThan(PLAN_PRICE_THB.STARTER);
    expect(PLAN_PRICE_THB.BUSINESS).toBeGreaterThan(PLAN_PRICE_THB.PRO);
  });
});
