import { describe, expect, it } from "vitest";

import {
  hasBuyIntent,
  parseQuantity,
  wantsProductImage,
} from "@/features/sales/order-intent";
import { toImageUrl } from "@/lib/validation";

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
  it("treats a soft verb + quantity as buying, but not on its own", () => {
    // Real customers say "เอา…" not just "สั่ง…". Needs an explicit quantity+unit
    // so casual "เอาไว้บำรุง" never creates a phantom order.
    expect(hasBuyIntent("เอาโทนเนอร์เช็ดหน้า 1 ขวดค่ะ")).toBe(true);
    expect(hasBuyIntent("รับ 3 กล่องค่ะ")).toBe(true);
    expect(hasBuyIntent("เอาไว้บำรุงด้วย")).toBe(false);
    expect(hasBuyIntent("เอาอันไหนดี")).toBe(false);
  });
  it("parses quantity (incl. skincare units)", () => {
    expect(parseQuantity("เอา 3 ชิ้น")).toBe(3);
    expect(parseQuantity("x2")).toBe(2);
    expect(parseQuantity("2 ขวด")).toBe(2);
    expect(parseQuantity("ขอสั่งลิป")).toBe(1);
  });
});

describe("product image request", () => {
  it("detects a 'show me a photo' ask", () => {
    expect(wantsProductImage("ขอดูรูปหน่อยค่ะ")).toBe(true);
    expect(wantsProductImage("มีรูปสินค้าไหม")).toBe(true);
    expect(wantsProductImage("ราคาเท่าไหร่")).toBe(false);
  });
});

describe("image URL validation", () => {
  it("accepts only public https URLs", () => {
    expect(toImageUrl("https://cdn.shop.com/a.jpg")).toBe(
      "https://cdn.shop.com/a.jpg",
    );
    expect(toImageUrl("http://insecure.com/a.jpg")).toBeNull();
    expect(toImageUrl("not a url")).toBeNull();
    expect(toImageUrl("")).toBeNull();
  });
});
