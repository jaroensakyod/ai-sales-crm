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

  it("injects prior turns as short-term memory (keeps the bot on-topic)", () => {
    const prompt = buildSalesSystemPrompt({
      settings: null,
      catalog: [],
      history: [
        { direction: "INBOUND", body: "ฟินิชผิวคืออะไร" },
        { direction: "OUTBOUND", body: "คือลุคผิวหลังแต่งหน้าค่ะ" },
      ],
    });
    expect(prompt).toContain("บทสนทนาก่อนหน้า");
    expect(prompt).toContain("ลูกค้า: ฟินิชผิวคืออะไร");
    expect(prompt).toContain("ร้าน: คือลุคผิวหลังแต่งหน้าค่ะ");
  });

  it("omits the memory block when there is no history", () => {
    const prompt = buildSalesSystemPrompt({ settings: null, catalog: [] });
    expect(prompt).not.toContain("บทสนทนาก่อนหน้า");
  });

  it("defaults to the calm consultative mode + no emoji", () => {
    const prompt = buildSalesSystemPrompt({ settings: null, catalog: [] });
    expect(prompt).toContain("โหมดที่ปรึกษา");
    expect(prompt).toContain("ห้ามใช้อิโมจิเด็ดขาด");
  });

  it("applies the selected reply mode + emoji level", () => {
    const prompt = buildSalesSystemPrompt({
      settings: null,
      catalog: [],
      replyMode: "MINIMAL",
      emojiLevel: "NORMAL",
    });
    expect(prompt).toContain("โหมดสั้นข้อมูลล้วน");
    expect(prompt).toContain("ใช้อิโมจิได้พอประมาณ");
    expect(prompt).not.toContain("ห้ามใช้อิโมจิเด็ดขาด");
  });

  it("forbids the model from leaking its internal checklist", () => {
    const prompt = buildSalesSystemPrompt({ settings: null, catalog: [] });
    expect(prompt).toContain("ห้ามแสดงรายการตรวจสอบ");
  });
});

describe("reply-mode helpers", () => {
  it("only lets selling modes auto cross-sell (L1)", async () => {
    const { modeAllowsCrossSell, emojiAllowed } = await import(
      "@/features/ai/reply-mode"
    );
    expect(modeAllowsCrossSell("PROACTIVE")).toBe(true);
    expect(modeAllowsCrossSell("BALANCED")).toBe(true);
    expect(modeAllowsCrossSell(null)).toBe(false); // default = consultative
    expect(modeAllowsCrossSell("MINIMAL")).toBe(false);
    expect(emojiAllowed("NONE")).toBe(false);
    expect(emojiAllowed(null)).toBe(false);
    expect(emojiAllowed("NORMAL")).toBe(true);
  });
});
