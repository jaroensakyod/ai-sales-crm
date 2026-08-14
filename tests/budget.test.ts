import { describe, expect, it } from "vitest";

import { resolveBudgetTier } from "@/features/billing/budget";

describe("resolveBudgetTier", () => {
  it("is unlimited (normal) with no cap", () => {
    expect(resolveBudgetTier({ monthlySpendUsd: 999, softCapUsd: null })).toBe(
      "normal",
    );
    expect(resolveBudgetTier({ monthlySpendUsd: 999, softCapUsd: 0 })).toBe(
      "normal",
    );
  });
  it("normal below the cap", () => {
    expect(resolveBudgetTier({ monthlySpendUsd: 4, softCapUsd: 5 })).toBe(
      "normal",
    );
  });
  it("downgraded between 1x and 2x the cap", () => {
    expect(resolveBudgetTier({ monthlySpendUsd: 6, softCapUsd: 5 })).toBe(
      "downgraded",
    );
    expect(resolveBudgetTier({ monthlySpendUsd: 9.99, softCapUsd: 5 })).toBe(
      "downgraded",
    );
  });
  it("disables L3 at/above 2x the cap", () => {
    expect(resolveBudgetTier({ monthlySpendUsd: 10, softCapUsd: 5 })).toBe(
      "l3_disabled",
    );
  });
});
