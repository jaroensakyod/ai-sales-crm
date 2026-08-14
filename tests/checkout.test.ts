import { describe, expect, it } from "vitest";

import { hasBuyIntent, parseQuantity } from "@/features/sales/order-intent";

describe("purchase intent", () => {
  it("detects a buy verb", () => {
    expect(hasBuyIntent("ขอสั่งลิปสติกสีแดง 2 ชิ้น")).toBe(true);
    expect(hasBuyIntent("ซื้อรองพื้น")).toBe(true);
  });
  it("ignores questions (price/stock)", () => {
    expect(hasBuyIntent("ลิปสติกราคาเท่าไหร่")).toBe(false);
    expect(hasBuyIntent("มีสีแดงไหม")).toBe(false);
    expect(hasBuyIntent("รับประกันมั้ย")).toBe(false);
  });
  it("parses quantity", () => {
    expect(parseQuantity("เอา 3 ชิ้น")).toBe(3);
    expect(parseQuantity("x2")).toBe(2);
    expect(parseQuantity("ขอสั่งลิป")).toBe(1);
  });
});
