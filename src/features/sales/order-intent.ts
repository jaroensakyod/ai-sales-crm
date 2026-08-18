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

/** True if the message reads as a question rather than a statement/selection.
 *  Used so "แบบ pdf มีไหม" (asking) doesn't get treated as picking the PDF version. */
export function looksLikeQuestion(text: string): boolean {
  const n = text.toLowerCase();
  return QUESTION_MARKERS.some((q) => n.includes(q));
}

export function hasBuyIntent(text: string): boolean {
  const n = text.toLowerCase();
  if (QUESTION_MARKERS.some((q) => n.includes(q))) return false;
  if (BUY_KEYWORDS.some((k) => n.includes(k.toLowerCase()))) return true;
  // Soft verb + an explicit quantity/unit is a strong enough buying signal.
  return SOFT_BUY_KEYWORDS.some((k) => n.includes(k)) && QTY_UNIT.test(text);
}

// The customer taps "ยืนยันสั่งซื้อ" (or types a clear yes to the confirm prompt).
// Only meaningful when a DRAFT order is already awaiting confirmation — the caller
// checks that, so we can keep this loose enough to catch a plain "ยืนยัน"/"ok".
const CONFIRM_KEYWORDS = [
  "ยืนยันสั่งซื้อ",
  "ยืนยันคำสั่งซื้อ",
  "ยืนยันออเดอร์",
  "ยืนยัน",
  "confirm",
  "ตกลงสั่ง",
  "เอาเลย",
  "สั่งเลย",
  "ปิดการขาย",
];

export function hasConfirmIntent(text: string): boolean {
  const n = text.trim().toLowerCase();
  return CONFIRM_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
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

const REVIEW_KEYWORDS = [
  "รีวิว",
  "review",
  "คนอื่นใช้",
  "มีคนใช้",
  "ใช้แล้วเป็นไง",
  "ใช้แล้วเป็นยังไง",
  "ผลตอบรับ",
  "ประสบการณ์",
  "feedback",
  "ฟีดแบค",
  "น่าเชื่อถือ",
];

/** Customer is asking for social proof ("มีรีวิวไหม"). */
export function wantsReview(text: string): boolean {
  const n = text.toLowerCase();
  return REVIEW_KEYWORDS.some((k) => n.includes(k));
}

// Pure greetings only — "what products do you have?" now goes to the catalog
// handler (product carousel), not the welcome banner, so the two never collide.
const WELCOME_KEYWORDS = [
  "สวัสดี",
  "หวัดดี",
  "hello",
  "hi ",
  "สนใจสินค้า",
];

/** A greeting — triggers the auto promo banner. */
export function wantsWelcome(text: string): boolean {
  const n = text.trim().toLowerCase();
  // Bare "hi" (whole message) counts too, but "hi" inside a word shouldn't.
  if (n === "hi") return true;
  return WELCOME_KEYWORDS.some((k) => n.includes(k));
}

// "What do you sell / show me the products" — the customer wants the catalog.
const CATALOG_KEYWORDS = [
  "มีสินค้าอะไรบ้าง",
  "สินค้าอะไรบ้าง",
  "มีสินค้าอะไร",
  "มีอะไรบ้าง",
  "มีอะไรขาย",
  "ขายอะไร",
  "ดูสินค้า",
  "สอบถามสินค้า",
  "มีของอะไรบ้าง",
  "แคตตาล็อก",
  "เมนูสินค้า",
];

/** Customer is asking to see the product list ("มีสินค้าอะไรบ้าง"). */
export function wantsCatalog(text: string): boolean {
  const n = text.trim().toLowerCase();
  return CATALOG_KEYWORDS.some((k) => n.includes(k.toLowerCase()));
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
