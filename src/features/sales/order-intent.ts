/**
 * Detect a clear purchase intent in an inbound message (pure). Deliberately
 * strict: needs an explicit "buy" verb and must NOT be a question, so questions
 * like "ลิปสติกราคาเท่าไหร่" or "มีสีแดงไหม" never trigger a real order.
 */
const BUY_KEYWORDS = [
  "สั่งซื้อ",
  "ขอสั่ง",
  "สั่ง",
  "ซื้อ",
  "จะซื้อ",
  "จะเอา",
  "ขอออเดอร์",
  "order",
  "checkout",
];

const QUESTION_MARKERS = ["ไหม", "มั้ย", "หรือเปล่า", "รึเปล่า", "เหรอ", "?"];

export function hasBuyIntent(text: string): boolean {
  const n = text.toLowerCase();
  if (QUESTION_MARKERS.some((q) => n.includes(q))) return false;
  return BUY_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
}

/** Parse a quantity like "2 ชิ้น", "3 ห่อ", "x2", "จำนวน 5"; defaults to 1. */
export function parseQuantity(text: string): number {
  const m =
    text.match(/(\d+)\s*(ชิ้น|อัน|ห่อ|กล่อง|ชุด|ตัว|แพ็ค|แพ็ก)/) ||
    text.match(/x\s*(\d+)/i) ||
    text.match(/จำนวน\s*(\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 1 && n <= 999 ? n : 1;
}
