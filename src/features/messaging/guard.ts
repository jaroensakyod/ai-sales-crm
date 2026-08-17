/**
 * Abuse guards run before the AI, so floods and prompt-injection attempts never
 * cost a model call or bend the bot off-task.
 */

// ---- Flood / rate limit --------------------------------------------------

/** More than MAX inbound messages within WINDOW_MS from one conversation is
 *  treated as spam/abuse (a real customer rarely types this fast). */
export const FLOOD_WINDOW_MS = 20_000;
export const FLOOD_MAX = 12;

export function isFlooding(inboundCountInWindow: number): boolean {
  return inboundCountInWindow > FLOOD_MAX;
}

// ---- Jailbreak / prompt injection ---------------------------------------

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|the\s+|your\s+)?(previous|above|prior)?\s*(instruction|rule|prompt|message)/i,
  /disregard\s+(all\s+|the\s+|your\s+)?(previous|above)?\s*(instruction|rule|prompt)/i,
  /(system|initial|original)\s+(prompt|instruction|message)/i,
  /(reveal|show|print|repeat|tell\s+me)\s+(your\s+)?(prompt|instruction|system|rules?)/i,
  /you\s+are\s+now|act\s+as\s+(a|an|if)|pretend\s+(to\s+be|you)|developer\s+mode|jailbreak|\bDAN\b/i,
  /ลืม(คำสั่ง|กฎ|ที่บอก|ข้อความ)|เพิกเฉย.*(คำสั่ง|กฎ)/,
  /(บอก|ขอดู|เปิดเผย|แสดง).*(prompt|คำสั่ง(ระบบ)?|ระบบของ|กฎของ|instruction)/,
  /(แกล้ง|สวมบทบาท|ทำตัว|ปลอม)\s*(เป็น|ตัวเป็น)|โหมดนักพัฒนา|โหมดผู้พัฒนา/,
];

export function looksLikeJailbreak(text: string): boolean {
  return JAILBREAK_PATTERNS.some((re) => re.test(text));
}

/** Polite deflection — stay on the shop's topic, never confirm/deny any prompt. */
export const JAILBREAK_REPLY =
  "ขอโทษค่ะ ทางร้านช่วยเรื่องสินค้าและบริการของร้านได้นะคะ สนใจสอบถามอะไรแจ้งได้เลยค่ะ";
