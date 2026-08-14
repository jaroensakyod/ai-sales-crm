import { describe, expect, it } from "vitest";

import { buildPromptPayPayload } from "@/features/payment/promptpay";

// Recompute CRC over everything except the last 4 chars and compare.
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

describe("buildPromptPayPayload", () => {
  it("builds a valid dynamic (with amount) payload for a mobile number", () => {
    const p = buildPromptPayPayload("0812345678", 490);
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("010212"); // dynamic
    expect(p).toContain("A000000677010111"); // AID
    expect(p).toContain("0066812345678"); // formatted phone
    expect(p).toContain("5303764"); // THB
    expect(p).toContain("540649"); // amount 490.00 -> len 6 "490.00"
    expect(p).toContain("5802TH");
    // CRC check
    const body = p.slice(0, -4);
    expect(p.slice(-4)).toBe(crc16(body));
  });

  it("builds a static payload (no amount) as 0111", () => {
    const p = buildPromptPayPayload("0812345678");
    expect(p).toContain("010211"); // static
    expect(p).not.toContain("5406");
  });

  it("handles a national ID target", () => {
    const p = buildPromptPayPayload("1234567890123", 100);
    expect(p).toContain("29370016A00000067701011102131234567890123");
  });
});
