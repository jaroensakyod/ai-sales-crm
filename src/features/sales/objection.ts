/**
 * Lightweight objection classifier for inbound messages (Objection Engine,
 * docs/01 differentiator). Pure keyword matching — cheap, runs on every message
 * so the pipeline builds an objection breakdown without an AI call.
 */
export type ObjectionType =
  | "PRICE"
  | "TRUST"
  | "TIMING"
  | "NEED"
  | "COMPETITOR"
  | "SHIPPING"
  | "OTHER";

const RULES: { type: ObjectionType; keywords: string[] }[] = [
  { type: "PRICE", keywords: ["แพง", "ลดได้ไหม", "ลดหน่อย", "ราคาสูง", "ไม่มีงบ", "expensive", "too expensive"] },
  { type: "COMPETITOR", keywords: ["ที่อื่นถูกกว่า", "เจ้าอื่น", "ร้านอื่น", "cheaper elsewhere"] },
  { type: "SHIPPING", keywords: ["ส่งช้า", "ค่าส่งแพง", "ส่งนาน", "กี่วันถึง", "shipping too"] },
  { type: "TRUST", keywords: ["ของแท้ไหม", "ของปลอม", "เชื่อได้ไหม", "กลัวโดนโกง", "มีรีวิวไหม", "รีวิว"] },
  { type: "TIMING", keywords: ["ไว้ก่อน", "ยังไม่พร้อม", "เดี๋ยวก่อน", "ไว้คราวหน้า", "next time", "maybe later"] },
  { type: "NEED", keywords: ["ยังไม่แน่ใจ", "ไม่รู้จะเอาอันไหน", "ขอคิดดูก่อน", "not sure"] },
];

/** First matching objection type by priority, or null. */
export function detectObjection(text: string): ObjectionType | null {
  const n = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => n.includes(k.toLowerCase()))) return rule.type;
  }
  return null;
}
