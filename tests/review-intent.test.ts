import { describe, expect, it } from "vitest";

import { wantsReview } from "@/features/sales/order-intent";

describe("wantsReview", () => {
  it("detects asks for social proof", () => {
    expect(wantsReview("มีรีวิวไหมคะ")).toBe(true);
    expect(wantsReview("คนอื่นใช้แล้วเป็นไงบ้าง")).toBe(true);
    expect(wantsReview("ขอดู review หน่อย")).toBe(true);
    expect(wantsReview("น่าเชื่อถือไหม")).toBe(true);
  });
  it("ignores unrelated messages", () => {
    expect(wantsReview("ราคาเท่าไหร่")).toBe(false);
    expect(wantsReview("ขอดูรูปสินค้า")).toBe(false);
  });
});
