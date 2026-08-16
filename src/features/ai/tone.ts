/** Preset bot personalities the merchant picks from a dropdown (no writing). */
export const TONE_OPTIONS = [
  {
    key: "FRIENDLY",
    label: "เป็นกันเอง / น่ารัก",
    instruction:
      "พูดจาน่ารัก เป็นกันเอง อบอุ่นเหมือนเพื่อนสนิท ใช้คำลงท้าย ค่า/น้า/นะคะ ได้",
  },
  {
    key: "FORMAL",
    label: "สุภาพ ทางการ",
    instruction:
      "สุภาพเป็นทางการ ใช้ ค่ะ/ครับ เต็มรูป ไม่ใช้คำแสลงหรือคำลงท้ายน่ารัก",
  },
  {
    key: "PLAYFUL",
    label: "สนุก สดใส",
    instruction: "สดใส สนุก มีพลัง กระตือรือร้น ใช้อิโมจิได้มากขึ้นอีกนิด",
  },
  {
    key: "CONCISE",
    label: "กระชับ ตรงประเด็น",
    instruction: "ตอบสั้นกระชับที่สุด ตรงประเด็น ไม่ฟุ่มเฟือย ไม่ต้องเกริ่นเยอะ",
  },
] as const;

export type ToneKey = (typeof TONE_OPTIONS)[number]["key"];

export function toneInstruction(key?: string | null): string | null {
  const found = TONE_OPTIONS.find((t) => t.key === key);
  return found ? found.instruction : null;
}
