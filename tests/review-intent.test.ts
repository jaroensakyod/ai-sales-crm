import { describe, expect, it } from "vitest";

import { wantsReview, wantsWelcome } from "@/features/sales/order-intent";

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

describe("wantsWelcome", () => {
  it("fires on greetings and catalog inquiries", () => {
    expect(wantsWelcome("สวัสดีค่ะ")).toBe(true);
    expect(wantsWelcome("hi")).toBe(true);
    expect(wantsWelcome("มีสินค้าอะไรบ้างคะ")).toBe(true);
    expect(wantsWelcome("ขายอะไรบ้าง")).toBe(true);
  });
  it("does not fire on specific questions or 'hi' inside a word", () => {
    expect(wantsWelcome("ราคาเท่าไหร่")).toBe(false);
    expect(wantsWelcome("this")).toBe(false); // 'hi' substring must not match
  });
});
