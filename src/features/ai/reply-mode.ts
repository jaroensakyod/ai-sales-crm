/**
 * Reply modes — merchant-selectable sales behaviour for the AI.
 *
 * Separate from tone (features/ai/tone.ts): tone = personality (how it *sounds*),
 * mode = sales behaviour (how hard it *pushes*: upsell, closing, question-asking).
 * Feedback from real chats: the default was too pushy + emoji-heavy, so shops now
 * pick a mode, and emoji is a separate merchant-controlled knob (see EMOJI_LEVELS).
 *
 * Default (null) = CONSULTATIVE: answer helpfully, don't hard-sell.
 */
export type ReplyMode = {
  key: string;
  label: string;
  instruction: string;
};

export const REPLY_MODES: ReplyMode[] = [
  {
    key: "CONSULTATIVE",
    label: "ที่ปรึกษา — สุภาพ ไม่ตื๊อ (แนะนำ)",
    instruction:
      "โหมดที่ปรึกษา: ตอบคำถามให้ตรงและครบก่อนเป็นหลัก อย่ายัดขาย อย่าถามชวนซื้อทุกข้อความ เสนอสินค้าได้อย่างมาก 1 อย่างที่เกี่ยวข้องจริง ๆ แบบไม่กดดัน และเฉพาะเมื่อเหมาะสม ถ้าลูกค้าถามข้อมูลก็ให้ข้อมูลพอ ไม่ต้องปิดการขายทุกครั้ง",
  },
  {
    key: "BALANCED",
    label: "สมดุล — ตอบ + แนะนำนิดหน่อย",
    instruction:
      "โหมดสมดุล: ตอบคำถามให้ครบ แล้วแนะนำสินค้าที่เกี่ยวข้อง 1 อย่างแบบเป็นธรรมชาติ ปิดท้ายด้วยคำชวนเบา ๆ ได้บ้างแต่ไม่ทุกข้อความ ไม่กดดันลูกค้า",
  },
  {
    key: "PROACTIVE",
    label: "นักขายเชิงรุก — เสนอ + ปิดการขาย",
    instruction:
      "โหมดนักขายเชิงรุก: กระตือรือร้น เสนอสินค้าที่เกี่ยวข้อง (cross-sell) และชวนปิดการขายอย่างสุภาพ ชี้ให้เห็นข้อดีและชวนตัดสินใจ แต่ยังต้องไม่ก้าวร้าวหรือรบเร้าเกินไป",
  },
  {
    key: "MINIMAL",
    label: "สั้น ข้อมูลล้วน — ไม่ชวนซื้อ",
    instruction:
      "โหมดสั้นข้อมูลล้วน: ตอบให้สั้นที่สุดเท่าที่ตอบคำถามได้ครบ เน้นข้อเท็จจริง ราคา/สเปก/ความพร้อมส่ง ห้ามชวนซื้อ ห้าม upsell ห้ามถามชวนต่อ เว้นแต่ลูกค้าถามเอง",
  },
  {
    key: "SUPPORT",
    label: "ดูแล/ซัพพอร์ต — เน้นช่วยเหลือ",
    instruction:
      "โหมดดูแลลูกค้า: โฟกัสที่การช่วยแก้ปัญหาและให้ข้อมูลที่เป็นประโยชน์ ใจเย็น เห็นอกเห็นใจ ไม่เน้นขาย เสนอสินค้าเฉพาะเมื่อช่วยแก้ปัญหาของลูกค้าได้จริงเท่านั้น",
  },
  {
    key: "CLOSER",
    label: "เร่งปิดการขาย — พาไปสั่ง/โอน",
    instruction:
      "โหมดเร่งปิดการขาย: เมื่อลูกค้าแสดงความสนใจ ให้พาเข้าสู่ขั้นตอนสั่งซื้อเร็ว ๆ (สรุปยอด ขอชื่อ-ที่อยู่ หรือบอกวิธีโอน) ลดการถามวนไปมา ทำให้ปิดการขายง่ายและไว แต่ยังสุภาพและไม่บังคับ",
  },
];

const REPLY_MODE_MAP = new Map(REPLY_MODES.map((m) => [m.key, m]));

/** Instruction for a mode key; falls back to CONSULTATIVE (the calm default). */
export function replyModeInstruction(key?: string | null): string {
  const mode = (key && REPLY_MODE_MAP.get(key)) || REPLY_MODE_MAP.get("CONSULTATIVE")!;
  return mode.instruction;
}

/** Emoji usage — merchant-controlled, independent of mode. Default = NONE. */
export const EMOJI_LEVELS = [
  { key: "NONE", label: "ไม่ใช้เลย (แนะนำ)" },
  { key: "LITTLE", label: "ใช้น้อย" },
  { key: "NORMAL", label: "ใช้ปกติ" },
] as const;

/**
 * Whether a mode wants the rule-based (L1) cross-sell auto-appended on price
 * questions. Calm modes (consultative/minimal/support) answer the question only;
 * selling modes add the "customers also bought…" nudge. Default (null) = calm.
 */
export function modeAllowsCrossSell(key?: string | null): boolean {
  return key === "BALANCED" || key === "PROACTIVE" || key === "CLOSER";
}

/** Whether the merchant allows any emoji at all (drives L1 emoji too). */
export function emojiAllowed(level?: string | null): boolean {
  return level === "LITTLE" || level === "NORMAL";
}

export function emojiInstruction(level?: string | null): string {
  switch (level) {
    case "NORMAL":
      return "ใช้อิโมจิได้พอประมาณให้ดูเป็นมิตร ไม่ต้องเยอะเกินไป";
    case "LITTLE":
      return "ใช้อิโมจิได้เล็กน้อยเท่านั้น (ไม่เกิน 1 ตัวต่อข้อความ) หรือไม่ใช้เลยก็ได้";
    case "NONE":
    default:
      return "ห้ามใช้อิโมจิเด็ดขาด ตอบเป็นข้อความล้วน ๆ";
  }
}
