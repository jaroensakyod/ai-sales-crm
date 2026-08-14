import type { paymentSettings } from "@/db/schema";

type PaymentSettings = typeof paymentSettings.$inferSelect;

/**
 * Build the customer-facing "แจ้งโอน" message from the store's payout settings
 * and an order total (pure, so it's testable and identical everywhere it's used
 * — order detail copy button and the AI's reply).
 */
export function buildPaymentInstruction(
  settings: Partial<PaymentSettings> | null,
  args: { total: number },
): string {
  const lines: string[] = [];
  lines.push(`🧾 สรุปยอดสั่งซื้อ`);
  lines.push(`ยอดชำระ ${args.total.toLocaleString("th-TH")} บาท`);

  if (settings?.shippingNote) {
    lines.push(`ขนส่งโดย ${settings.shippingNote}`);
  }
  if (settings?.shopName) {
    lines.push(`ร้าน "${settings.shopName}" 📍`);
  }

  const hours = settings?.paymentWindowHours ?? 12;
  lines.push("");
  lines.push(
    `กรุณาโอนภายใน ${hours} ชั่วโมง เพื่อสงวนสิทธิ์การสั่งซื้อ ` +
      `หากเลยกำหนดขออนุญาตยกเลิกออเดอร์นะคะ`,
  );

  if (settings?.bankName || settings?.bankAccountNo) {
    lines.push("");
    lines.push(
      `${settings?.bankName ?? "ธนาคาร"}: ${settings?.bankAccountNo ?? "-"}`,
    );
    if (settings?.bankAccountName) {
      lines.push(`ชื่อบัญชี ${settings.bankAccountName}`);
    }
  }
  if (settings?.promptpayId) {
    lines.push(`พร้อมเพย์: ${settings.promptpayId}`);
  }

  lines.push("");
  lines.push(
    `หลังโอน รบกวนแจ้งสลิป 📨 พร้อมชื่อ-ที่อยู่-เบอร์โทร เพื่อจัดส่งนะคะ 🙏`,
  );
  if (settings?.instructionExtra) {
    lines.push("");
    lines.push(settings.instructionExtra);
  }
  return lines.join("\n");
}

/** Short one-line payout summary for the AI's system prompt (so it can relay). */
export function paymentSummaryForAi(
  settings: Partial<PaymentSettings> | null,
): string | null {
  if (!settings) return null;
  const parts: string[] = [];
  if (settings.bankName && settings.bankAccountNo) {
    parts.push(
      `โอน ${settings.bankName} ${settings.bankAccountNo}` +
        (settings.bankAccountName ? ` (${settings.bankAccountName})` : ""),
    );
  }
  if (settings.promptpayId) parts.push(`พร้อมเพย์ ${settings.promptpayId}`);
  return parts.length ? parts.join(" / ") : null;
}
