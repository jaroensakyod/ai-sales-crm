/** Booking intent + Thai date/time parsing for chat-driven appointments. */
import { uniqueBestMatch } from "@/features/shared/match";

type ServiceLike = { id: string; name: string; durationMin: number; isActive?: boolean };

const BOOK_KEYWORDS = ["จอง", "นัด", "ขอคิว", "จองคิว", "book"];
// "จองยังไง / นัดได้ไหม" are questions about HOW to book, not a booking.
const QUESTION_MARKERS = ["ยังไง", "ไหม", "มั้ย", "หรือเปล่า", "รึเปล่า", "อย่างไร"];

export function hasBookingIntent(text: string): boolean {
  const n = text.toLowerCase();
  if (!BOOK_KEYWORDS.some((k) => n.includes(k))) return false;
  // A concrete time makes it a real booking even if phrased with a question word.
  if (QUESTION_MARKERS.some((q) => n.includes(q)) && !parseThaiDateTime(text)) {
    return false;
  }
  return true;
}

/** Match a service the customer named (partial names ok). Requires a unique
 *  match; ambiguous ("นวด" with several massage services) → null. */
export function matchService<T extends ServiceLike>(
  text: string,
  services: T[],
): T | null {
  const active = services.filter((s) => s.isActive !== false);
  return uniqueBestMatch(text, active, (s) => s.name);
}

// Thailand is a fixed UTC+7 (no DST). All booking times are Thai wall-clock, so
// we do the math in Bangkok terms and convert to a real instant — correct on any
// server timezone (Vercel/CI run in UTC).
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Parse a Thai date + time into the appointment start (a real instant for the
 * Thai wall-clock time said). Handles the common spoken forms; returns null when
 * no clear time is present (so the bot asks instead of guessing). Day defaults to
 * today, rolling to tomorrow if that time already passed. `now` is injectable.
 */
export function parseThaiDateTime(
  text: string,
  now: Date = new Date(),
): Date | null {
  const n = text;
  // "now" expressed as Bangkok wall-clock (read via UTC getters after shifting).
  const bkkNow = new Date(now.getTime() + BKK_OFFSET_MS);

  // ---- day ----
  let dayOffset = 0;
  let daySpecified = false;
  if (/วันนี้/.test(n)) {
    daySpecified = true;
  } else if (/พรุ่งนี้|พรุ้งนี้/.test(n)) {
    dayOffset = 1;
    daySpecified = true;
  } else if (/มะรืน/.test(n)) {
    dayOffset = 2;
    daySpecified = true;
  } else {
    const dows: Record<string, number> = {
      อาทิตย์: 0,
      จันทร์: 1,
      อังคาร: 2,
      พุธ: 3,
      พฤหัสบดี: 4,
      พฤหัส: 4,
      ศุกร์: 5,
      เสาร์: 6,
    };
    for (const [k, v] of Object.entries(dows)) {
      if (n.includes(k)) {
        let diff = (v - bkkNow.getUTCDay() + 7) % 7;
        if (diff === 0) diff = 7; // "วันจันทร์" = next Monday, not today
        dayOffset = diff;
        daySpecified = true;
        break;
      }
    }
  }

  // ---- time ----
  let hour: number | null = null;
  let minute = 0;
  let m: RegExpMatchArray | null;
  if ((m = n.match(/(\d{1,2})[:.](\d{2})/))) {
    hour = +m[1];
    minute = +m[2];
  } else if (/เที่ยงคืน/.test(n)) {
    hour = 0;
  } else if (/เที่ยง/.test(n)) {
    hour = 12;
  } else if ((m = n.match(/บ่าย\s*(\d{1,2})?/))) {
    const h = m[1] ? +m[1] : 1; // บ่ายโมง = 13:00
    hour = h >= 1 && h <= 6 ? 12 + h : 13;
  } else if ((m = n.match(/(\d{1,2})\s*ทุ่ม/))) {
    hour = 18 + +m[1]; // 1 ทุ่ม = 19:00
  } else if ((m = n.match(/ตี\s*(\d{1,2})/))) {
    hour = +m[1]; // ตี 5 = 05:00
  } else if ((m = n.match(/(\d{1,2})\s*โมงเย็น/))) {
    hour = 12 + +m[1]; // 5 โมงเย็น = 17:00
  } else if ((m = n.match(/(\d{1,2})\s*โมง(?:เช้า)?/))) {
    hour = +m[1]; // 10 โมง(เช้า) = 10:00
  }

  if (hour === null || hour < 0 || hour > 23 || minute > 59) return null;

  // Build the instant for the Bangkok wall time (subtract the +7 offset).
  const y = bkkNow.getUTCFullYear();
  const mo = bkkNow.getUTCMonth();
  const d = bkkNow.getUTCDate();
  const at = (extraDay: number) =>
    new Date(Date.UTC(y, mo, d + dayOffset + extraDay, hour, minute) - BKK_OFFSET_MS);
  let start = at(0);
  if (!daySpecified && start.getTime() <= now.getTime()) start = at(1);
  return start;
}
