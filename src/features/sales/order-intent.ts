/**
 * Detect a clear purchase intent in an inbound message (pure). Deliberately
 * strict: needs an explicit "buy" verb and must NOT be a question, so questions
 * like "ลิปสติกราคาเท่าไหร่" or "มีสีแดงไหม" never trigger a real order.
 */
// Unambiguous purchase verbs — trigger a real order on their own.
const BUY_KEYWORDS = [
  "สั่งซื้อ",
  "ขอสั่ง",
  "สั่ง",
  "ซื้อ",
  "จะซื้อ",
  "จะเอา",
  "ขอออเดอร์",
  "ปิดออเดอร์",
  "order",
  "checkout",
];

// Weaker verbs ("เอา"/"รับ") — count as buying ONLY with a quantity+unit, so
// "เอาโทนเนอร์ 1 ขวด" is an order but "เอาไว้บำรุง" / "รับประกันไหม" is not.
const SOFT_BUY_KEYWORDS = ["เอา", "รับ"];

const UNIT = "ชิ้น|อัน|ห่อ|กล่อง|ชุด|ตัว|แพ็ค|แพ็ก|ขวด|หลอด|แผง|กระปุก|คู่";
const QTY_UNIT = new RegExp(`(\\d+)\\s*(${UNIT})`);

const QUESTION_MARKERS = ["ไหม", "มั้ย", "หรือเปล่า", "รึเปล่า", "เหรอ", "?"];

export function hasBuyIntent(text: string): boolean {
  const n = text.toLowerCase();
  if (QUESTION_MARKERS.some((q) => n.includes(q))) return false;
  if (BUY_KEYWORDS.some((k) => n.includes(k.toLowerCase()))) return true;
  // Soft verb + an explicit quantity/unit is a strong enough buying signal.
  return SOFT_BUY_KEYWORDS.some((k) => n.includes(k)) && QTY_UNIT.test(text);
}

// "Can I see a photo?" — the customer wants to see the product image.
const IMAGE_REQUEST_KEYWORDS = [
  "ดูรูป",
  "ขอรูป",
  "มีรูป",
  "ส่งรูป",
  "รูปสินค้า",
  "ดูภาพ",
  "ขอภาพ",
  "รูปจริง",
  "รูปตัวอย่าง",
];

export function wantsProductImage(text: string): boolean {
  const n = text.toLowerCase();
  return IMAGE_REQUEST_KEYWORDS.some((k) => n.includes(k));
}

/** Parse a quantity like "2 ชิ้น", "3 ห่อ", "x2", "จำนวน 5"; defaults to 1. */
export function parseQuantity(text: string): number {
  const m =
    text.match(QTY_UNIT) ||
    text.match(/x\s*(\d+)/i) ||
    text.match(/จำนวน\s*(\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 1 && n <= 999 ? n : 1;
}
