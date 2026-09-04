import { describe, expect, it } from "vitest";

import { detectUnauthorizedDiscount } from "@/features/ai/sales-agent";

describe("detectUnauthorizedDiscount", () => {
  it("flags a baht discount offered with zero authority (review #1)", () => {
    expect(detectUnauthorizedDiscount("ลดให้ 100 บาทเลยค่ะ", 0)).toBe(100);
    expect(detectUnauthorizedDiscount("ส่วนลดพิเศษ 200 บาทค่ะ", 0)).toBe(200);
    expect(detectUnauthorizedDiscount("ลดราคา 1,000 บาท", 0)).toBe(1000);
  });

  it("allows a discount within authority", () => {
    expect(detectUnauthorizedDiscount("ลด 50 บาทค่ะ", 50)).toBeNull();
    expect(detectUnauthorizedDiscount("ลด 30 บาทค่ะ", 50)).toBeNull();
  });

  it("allows a baht amount backed by an active promotion", () => {
    const allowed = new Set([100]);
    expect(detectUnauthorizedDiscount("ลด 100 บาทค่ะ", 0, allowed)).toBeNull();
    // but a different, un-promoted amount is still blocked
    expect(detectUnauthorizedDiscount("ลด 150 บาทค่ะ", 0, allowed)).toBe(150);
  });

  it("does not mistake a plain price for a discount", () => {
    expect(detectUnauthorizedDiscount("ราคา 1,890 บาทค่ะ", 0)).toBeNull();
    expect(
      detectUnauthorizedDiscount("Standard ราคา 1,890 บาท Premium 2,390 บาท", 0),
    ).toBeNull();
  });

  it("returns the largest offending amount when several appear", () => {
    expect(
      detectUnauthorizedDiscount("ลด 100 บาท แล้วลดอีก 250 บาท", 0),
    ).toBe(250);
  });
});
