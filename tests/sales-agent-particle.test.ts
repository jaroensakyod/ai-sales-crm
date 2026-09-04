import { describe, expect, it } from "vitest";

import { enforcePoliteParticle } from "@/features/ai/sales-agent";

describe("enforcePoliteParticle", () => {
  it("rewrites a stray ครับ to ค่ะ for a female persona (review)", () => {
    expect(enforcePoliteParticle("ได้เลยครับ", "female")).toBe("ได้เลยค่ะ");
    expect(enforcePoliteParticle("สวัสดีครับ ยินดีต้อนรับค่ะ", "female")).toBe(
      "สวัสดีค่ะ ยินดีต้อนรับค่ะ",
    );
    // Default (no gender set) is treated as female.
    expect(enforcePoliteParticle("ขอบคุณครับ", null)).toBe("ขอบคุณค่ะ");
  });

  it("handles ครับ variants and mid-sentence positions", () => {
    expect(enforcePoliteParticle("ได้ครับผม เดี๋ยวจัดให้", "female")).toBe(
      "ได้ค่ะ เดี๋ยวจัดให้",
    );
    expect(enforcePoliteParticle("โอเคคับ", "female")).toBe("โอเคค่ะ");
  });

  it("leaves a male persona untouched", () => {
    expect(enforcePoliteParticle("ได้เลยครับ", "male")).toBe("ได้เลยครับ");
  });

  it("does not touch text already using ค่ะ", () => {
    expect(enforcePoliteParticle("ได้เลยค่ะ", "female")).toBe("ได้เลยค่ะ");
  });
});
