import { describe, expect, it } from "vitest";

import { planEntitlements, PLAN_PRICE_THB } from "@/features/billing/plans";

describe("planEntitlements", () => {
  it("FREE/STARTER allow one channel, no automation", () => {
    for (const p of ["FREE", "STARTER"] as const) {
      const e = planEntitlements(p);
      expect(e.maxChannels).toBe(1);
      expect(e.followupAutomation).toBe(false);
      expect(e.fullAnalytics).toBe(false);
    }
  });
  it("PRO allows multiple channels + automation + analytics", () => {
    const e = planEntitlements("PRO");
    expect(e.maxChannels).toBeGreaterThan(1);
    expect(e.followupAutomation).toBe(true);
    expect(e.fullAnalytics).toBe(true);
  });
  it("has prices", () => {
    expect(PLAN_PRICE_THB.STARTER).toBeGreaterThan(0);
    expect(PLAN_PRICE_THB.PRO).toBeGreaterThan(PLAN_PRICE_THB.STARTER);
  });
});
