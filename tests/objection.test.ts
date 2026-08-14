import { describe, expect, it } from "vitest";

import { detectObjection } from "@/features/sales/objection";

describe("detectObjection", () => {
  it("classifies price objections", () => {
    expect(detectObjection("แพงจังเลย ลดได้ไหมคะ")).toBe("PRICE");
  });
  it("classifies trust objections", () => {
    expect(detectObjection("ของแท้ไหมคะ กลัวโดนโกง")).toBe("TRUST");
  });
  it("classifies competitor objections", () => {
    expect(detectObjection("ที่อื่นถูกกว่านะ")).toBe("COMPETITOR");
  });
  it("classifies timing objections", () => {
    expect(detectObjection("ขอไว้คราวหน้าก่อนนะ")).toBe("TIMING");
  });
  it("returns null when there is no objection", () => {
    expect(detectObjection("สนใจสั่งซื้อเลยค่ะ")).toBeNull();
  });
});
