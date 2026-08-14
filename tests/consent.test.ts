import { describe, expect, it } from "vitest";

import { detectConsentReply } from "@/features/consent/service";

describe("detectConsentReply", () => {
  it("detects acceptance", () => {
    expect(detectConsentReply("ยินยอมค่ะ")).toBe("accept");
    expect(detectConsentReply("ตกลงครับ")).toBe("accept");
  });
  it("detects decline, even though it contains the accept word", () => {
    expect(detectConsentReply("ไม่ยินยอม")).toBe("decline");
    expect(detectConsentReply("ขอปฏิเสธนะคะ")).toBe("decline");
  });
  it("returns null for unrelated messages", () => {
    expect(detectConsentReply("ราคาเท่าไหร่คะ")).toBeNull();
  });
});
