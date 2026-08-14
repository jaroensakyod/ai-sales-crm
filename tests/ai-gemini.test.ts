import { describe, expect, it } from "vitest";

import { estimateCostUsd, normalizeModelId } from "@/features/ai/gemini";
import { buildSalesSystemPrompt } from "@/features/ai/sales-agent";

describe("gemini helpers", () => {
  it("normalizes friendly model names", () => {
    expect(normalizeModelId("gemini-flash")).toBe("gemini-flash-latest");
    expect(normalizeModelId("gemini-flash-lite")).toBe("gemini-flash-lite-latest");
    expect(normalizeModelId("gemini-2.5-flash")).toBe("gemini-2.5-flash");
  });

  it("estimates cost from tokens", () => {
    const cost = estimateCostUsd("gemini-flash-lite", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.5, 6); // 0.10 input + 0.40 output
  });
});

describe("sales system prompt guardrails", () => {
  it("bakes in the hard rules (risk #2/#5)", () => {
    const prompt = buildSalesSystemPrompt({ settings: null, catalog: [] });
    expect(prompt).toContain("ห้ามอ้างสรรพคุณเกินจริง");
    expect(prompt).toContain("ส่วนลดเกิน 0 บาท"); // discount authority default 0
    expect(prompt).toContain("ห้ามเดา");
  });
});
