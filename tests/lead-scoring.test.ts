import { describe, expect, it } from "vitest";

import { computeLeadScore } from "@/features/sales/scoring";

describe("computeLeadScore", () => {
  it("is 0 for a cold lead", () => {
    expect(computeLeadScore({})).toBe(0);
  });

  it("rewards engagement, caps it", () => {
    expect(computeLeadScore({ messageCount: 3 })).toBe(15);
    expect(computeLeadScore({ messageCount: 100 })).toBe(30); // capped
  });

  it("rewards orders and payment", () => {
    expect(computeLeadScore({ hasOrder: true })).toBe(30);
    expect(computeLeadScore({ hasOrder: true, paidOrder: true })).toBe(70);
  });

  it("penalizes open objections but never below 0", () => {
    expect(computeLeadScore({ messageCount: 2, openObjections: 1 })).toBe(5);
    expect(computeLeadScore({ openObjections: 10 })).toBe(0);
  });

  it("stays within 0-100", () => {
    const score = computeLeadScore({
      messageCount: 50,
      hasOrder: true,
      paidOrder: true,
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
