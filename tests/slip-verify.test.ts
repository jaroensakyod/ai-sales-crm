import { describe, expect, it, vi } from "vitest";

import {
  evaluateSlip,
  parseSlipJson,
  verifySlip,
} from "@/features/payment/slip-verify";

describe("parseSlipJson", () => {
  it("parses a clean JSON object", () => {
    const p = parseSlipJson(
      '{"amount": 1250.5, "ref": "0123", "senderName": "สมชาย", "receiverName": "ร้าน", "transferredAt": "17 ส.ค. 10:00"}',
    );
    expect(p.amount).toBe(1250.5);
    expect(p.ref).toBe("0123");
    expect(p.senderName).toBe("สมชาย");
  });

  it("tolerates markdown code fences and surrounding prose", () => {
    const p = parseSlipJson('here you go:\n```json\n{"amount": 500}\n```');
    expect(p.amount).toBe(500);
  });

  it("strips commas and ฿ from a string amount", () => {
    expect(parseSlipJson('{"amount": "1,250.50"}').amount).toBe(1250.5);
    expect(parseSlipJson('{"amount": "฿ 300"}').amount).toBe(300);
  });

  it("returns null amount on garbage or missing", () => {
    expect(parseSlipJson("not json").amount).toBeNull();
    expect(parseSlipJson('{"foo": 1}').amount).toBeNull();
    expect(parseSlipJson('{"amount": null}').amount).toBeNull();
  });
});

describe("evaluateSlip", () => {
  it("MATCH exact and within 1 baht, MISMATCH otherwise", () => {
    expect(evaluateSlip({ amount: 1000 }, 1000).status).toBe("MATCH");
    expect(evaluateSlip({ amount: 999.5 }, 1000).status).toBe("MATCH");
    expect(evaluateSlip({ amount: 1000.5 }, 1000).status).toBe("MATCH");
    expect(evaluateSlip({ amount: 900 }, 1000).status).toBe("MISMATCH");
    expect(evaluateSlip({ amount: 1200 }, 1000).status).toBe("MISMATCH");
  });

  it("UNREADABLE when no amount was read", () => {
    const v = evaluateSlip({ amount: null }, 1000);
    expect(v.status).toBe("UNREADABLE");
    expect(v.verifiedAmount).toBeNull();
  });
});

describe("verifySlip", () => {
  const img = { data: "AAAA", mimeType: "image/jpeg" };

  it("OCRs then compares to the order total", async () => {
    const vision = vi.fn(async () => ({ text: '{"amount": 750}' }));
    const v = await verifySlip(img, 750, vision);
    expect(v.status).toBe("MATCH");
    expect(v.verifiedAmount).toBe(750);
    expect(vision).toHaveBeenCalledOnce();
  });

  it("returns UNREADABLE (never throws) when the vision call fails", async () => {
    const vision = vi.fn(async () => {
      throw new Error("boom");
    });
    const v = await verifySlip(img, 750, vision);
    expect(v.status).toBe("UNREADABLE");
  });
});
