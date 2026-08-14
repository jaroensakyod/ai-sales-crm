/**
 * Build a PromptPay QR payload (EMVCo standard) so customers can scan to pay
 * the exact order amount. Pure — no dependency; the QR image is rendered from
 * this string. Supports mobile number / national ID / e-wallet id.
 */

function tag(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** Normalize the PromptPay target and pick the right sub-tag. */
function merchantAccount(target: string): string {
  const digits = target.replace(/\D/g, "");
  const AID = tag("00", "A000000677010111");

  if (digits.length === 13) {
    // National ID
    return tag("29", AID + tag("02", digits));
  }
  if (digits.length === 15) {
    // e-Wallet
    return tag("29", AID + tag("03", digits));
  }
  // Mobile: 0812345678 -> 0066812345678 (13 chars)
  const phone = digits.replace(/^0/, "");
  const formatted = ("0066" + phone).slice(0, 13);
  return tag("29", AID + tag("01", formatted));
}

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

export function buildPromptPayPayload(target: string, amount?: number): string {
  const hasAmount = typeof amount === "number" && amount > 0;
  let payload =
    tag("00", "01") + // version
    tag("01", hasAmount ? "12" : "11") + // 12 = dynamic (with amount)
    merchantAccount(target) +
    tag("53", "764") + // THB
    (hasAmount ? tag("54", amount.toFixed(2)) : "") +
    tag("58", "TH");
  payload += "6304"; // CRC tag id + length, value appended next
  return payload + crc16(payload);
}
