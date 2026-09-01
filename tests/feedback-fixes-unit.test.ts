import { describe, expect, it } from "vitest";

import { buildPaymentInstruction } from "@/features/payment/instruction";
import { normalizeImageUrl } from "@/lib/validation";

describe("normalizeImageUrl", () => {
  it("rewrites a Google Drive file/view link to the direct-view form", () => {
    expect(
      normalizeImageUrl("https://drive.google.com/file/d/ABC123_xy/view?usp=sharing"),
    ).toBe("https://drive.google.com/uc?export=view&id=ABC123_xy");
  });

  it("rewrites an open?id link", () => {
    expect(normalizeImageUrl("https://drive.google.com/open?id=ZZ9-9")).toBe(
      "https://drive.google.com/uc?export=view&id=ZZ9-9",
    );
  });

  it("normalizes an already uc link to the export=view form", () => {
    expect(
      normalizeImageUrl("https://drive.google.com/uc?id=Q1w2E3&export=download"),
    ).toBe("https://drive.google.com/uc?export=view&id=Q1w2E3");
  });

  it("leaves a normal https image URL unchanged", () => {
    const url = "https://cdn.example.com/reviews/abc.jpg";
    expect(normalizeImageUrl(url)).toBe(url);
  });
});

describe("buildPaymentInstruction — digital vs physical", () => {
  const settings = {
    shippingNote: "EMS ส่งฟรีทั่วไทย",
    bankName: "KBank",
    bankAccountNo: "123-4-56789-0",
  };

  it("shows shipping note + address request for a physical order", () => {
    const out = buildPaymentInstruction(settings, { total: 1890, hasPhysical: true });
    expect(out).toContain("EMS ส่งฟรีทั่วไทย");
    expect(out).toContain("ที่อยู่");
  });

  it("omits shipping note + address request for an all-digital order", () => {
    const out = buildPaymentInstruction(settings, { total: 1890, hasPhysical: false });
    expect(out).not.toContain("EMS ส่งฟรีทั่วไทย");
    expect(out).not.toContain("ที่อยู่");
    // still shows the amount + bank so the customer can pay
    expect(out).toContain("1,890");
    expect(out).toContain("123-4-56789-0");
  });

  it("defaults to physical behaviour when hasPhysical is omitted (backward compat)", () => {
    const out = buildPaymentInstruction(settings, { total: 500 });
    expect(out).toContain("EMS ส่งฟรีทั่วไทย");
  });
});
