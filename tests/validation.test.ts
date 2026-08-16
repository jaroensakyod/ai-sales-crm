import { describe, expect, it } from "vitest";

import { toMoney, toPlainText, toSlug, toStock } from "@/lib/validation";

describe("input validation", () => {
  it("toMoney coerces and guards", () => {
    expect(toMoney("390.5")).toBe("390.50");
    expect(toMoney("abc")).toBe("0.00");
    expect(toMoney("-5")).toBe("0.00");
    expect(toMoney("1e9")).toBe("1000000000.00");
  });
  it("toStock: empty->null, valid int, reject negative/garbage", () => {
    expect(toStock("")).toBeNull();
    expect(toStock("50")).toBe(50);
    expect(toStock("-3")).toBeNull();
    expect(toStock("x")).toBeNull();
  });
  it("toSlug normalizes or returns null", () => {
    expect(toSlug("My Shop!")).toBe("my-shop");
    expect(toSlug("ร้าน 123")).toBe("123");
    expect(toSlug("!!!")).toBeNull();
    expect(toSlug("")).toBeNull();
  });

  it("toPlainText strips markdown for LINE/Messenger", () => {
    expect(toPlainText("**ลิปสติก** ราคา 420")).toBe("ลิปสติก ราคา 420");
    expect(toPlainText("# หัวข้อ\nข้อความ")).toBe("หัวข้อ\nข้อความ");
    expect(toPlainText("- รายการ 1\n- รายการ 2")).toBe("รายการ 1\nรายการ 2");
    expect(toPlainText("ปกติ ไม่มีอะไร")).toBe("ปกติ ไม่มีอะไร");
  });
});
