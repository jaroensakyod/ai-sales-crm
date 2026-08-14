import { describe, expect, it } from "vitest";

import {
  buildPaymentInstruction,
  paymentSummaryForAi,
} from "@/features/payment/instruction";

const settings = {
  shopName: "ร้านยาหอม",
  bankName: "กสิกร",
  bankAccountNo: "054-1-99123-9",
  bankAccountName: "ธฤษวรรณ ญาณะเครื่อง",
  promptpayId: null,
  shippingNote: "Flash Express / ไปรษณีย์ EMS",
  paymentWindowHours: 12,
  instructionExtra: null,
};

describe("buildPaymentInstruction", () => {
  it("includes total, bank, account name, shop, shipping, window", () => {
    const msg = buildPaymentInstruction(settings, { total: 490 });
    expect(msg).toContain("490");
    expect(msg).toContain("กสิกร: 054-1-99123-9");
    expect(msg).toContain("ธฤษวรรณ ญาณะเครื่อง");
    expect(msg).toContain("ร้านยาหอม");
    expect(msg).toContain("Flash Express");
    expect(msg).toContain("12 ชั่วโมง");
    expect(msg).toContain("แจ้งสลิป");
  });

  it("handles PromptPay and missing bank", () => {
    const msg = buildPaymentInstruction(
      { promptpayId: "0812345678", paymentWindowHours: 24 },
      { total: 200 },
    );
    expect(msg).toContain("พร้อมเพย์: 0812345678");
    expect(msg).toContain("24 ชั่วโมง");
  });

  it("summarizes for AI", () => {
    expect(paymentSummaryForAi(settings)).toContain("กสิกร 054-1-99123-9");
    expect(paymentSummaryForAi(null)).toBeNull();
  });
});
