/** Hotel intent + Thai date-range parsing for chat-driven room bookings. */

type RoomLike = { id: string; name: string; isActive?: boolean };

const BOOK_KEYWORDS = ["จอง", "เข้าพัก", "พักคืน", "จองห้อง"];
const AVAIL_KEYWORDS = ["ว่างไหม", "ว่างมั้ย", "มีห้อง", "ห้องว่าง", "ยังว่าง", "เหลือห้อง"];
const ROOM_HINT = ["ห้อง", "พัก", "คืน", "โรงแรม", "เช็คอิน", "เช็กอิน"];

export function hasHotelBookingIntent(text: string): boolean {
  const n = text.toLowerCase();
  return BOOK_KEYWORDS.some((k) => n.includes(k)) && ROOM_HINT.some((k) => n.includes(k));
}

export function isAvailabilityQuery(text: string): boolean {
  const n = text.toLowerCase();
  return AVAIL_KEYWORDS.some((k) => n.includes(k));
}

/** Any signal the message is about rooms/stays (so we engage the hotel flow). */
export function mentionsStay(text: string): boolean {
  const n = text.toLowerCase();
  return ROOM_HINT.some((k) => n.includes(k));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** Unique room-type match (name or leading word); null if none/ambiguous. */
export function matchRoom<T extends RoomLike>(text: string, rooms: T[]): T | null {
  const n = normalize(text);
  const active = rooms.filter((r) => r.isActive !== false);
  const hits = active.filter((r) => {
    const name = normalize(r.name);
    const lead = normalize(r.name.split(/\s+/)[0] ?? "");
    return (
      (name.length >= 2 && n.includes(name)) ||
      (lead.length >= 3 && lead !== name && n.includes(lead))
    );
  });
  return hits.length === 1 ? hits[0] : null;
}

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, "ม.ค": 1, กุมภาพันธ์: 2, "ก.พ": 2, มีนาคม: 3, "มี.ค": 3,
  เมษายน: 4, "เม.ย": 4, พฤษภาคม: 5, "พ.ค": 5, มิถุนายน: 6, "มิ.ย": 6,
  กรกฎาคม: 7, "ก.ค": 7, สิงหาคม: 8, "ส.ค": 8, กันยายน: 9, "ก.ย": 9,
  ตุลาคม: 10, "ต.ค": 10, พฤศจิกายน: 11, "พ.ย": 11, ธันวาคม: 12, "ธ.ค": 12,
};

function bkkToday(now: Date): { y: number; mo: number; d: number } {
  const s = new Date(now.getTime() + BKK_OFFSET_MS);
  return { y: s.getUTCFullYear(), mo: s.getUTCMonth(), d: s.getUTCDate() };
}

/** date string "YYYY-MM-DD" for the Bangkok calendar day `offset` days from now. */
function dateStr(now: Date, offsetDays: number): string {
  const s = new Date(now.getTime() + BKK_OFFSET_MS);
  s.setUTCDate(s.getUTCDate() + offsetDays);
  return s.toISOString().slice(0, 10);
}

function addDays(dateStrIn: string, n: number): string {
  const d = new Date(`${dateStrIn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Resolve an explicit "DD <thai month>" to a YYYY-MM-DD (this year, or next if
 *  already passed). Returns null if not found. */
function explicitDate(text: string, now: Date): string | null {
  const m = text.match(/(\d{1,2})\s*(มกราคม|ม\.?ค|กุมภาพันธ์|ก\.?พ|มีนาคม|มี\.?ค|เมษายน|เม\.?ย|พฤษภาคม|พ\.?ค|มิถุนายน|มิ\.?ย|กรกฎาคม|ก\.?ค|สิงหาคม|ส\.?ค|กันยายน|ก\.?ย|ตุลาคม|ต\.?ค|พฤศจิกายน|พ\.?ย|ธันวาคม|ธ\.?ค)/);
  if (!m) return null;
  const day = +m[1];
  const mon = THAI_MONTHS[m[2].replace(/\./g, "")] ?? THAI_MONTHS[m[2]];
  if (!mon || day < 1 || day > 31) return null;
  const { y } = bkkToday(now);
  const today = dateStr(now, 0);
  let iso = `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (iso < today) iso = `${y + 1}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso;
}

export type Stay = { checkIn: string; checkOut: string; nights: number };

/** Default stay (tonight, 1 night) — used when someone asks availability without
 *  giving dates ("มีห้องว่างไหม"). */
export function tonightStay(now: Date = new Date()): Stay {
  const checkIn = dateStr(now, 0);
  return { checkIn, checkOut: addDays(checkIn, 1), nights: 1 };
}

/**
 * Parse a stay: check-in date + number of nights (or an explicit checkout date).
 * Returns null when no check-in can be determined (so the bot asks). If a
 * check-in is clear but nights are not, defaults to 1 night.
 */
export function parseStay(text: string, now: Date = new Date()): Stay | null {
  let checkIn: string | null = null;

  if (/คืนนี้|วันนี้/.test(text)) checkIn = dateStr(now, 0);
  else if (/พรุ่งนี้|พรุ้งนี้/.test(text)) checkIn = dateStr(now, 1);
  else if (/มะรืน/.test(text)) checkIn = dateStr(now, 2);
  else {
    const explicit = explicitDate(text, now);
    if (explicit) checkIn = explicit;
    else {
      const dows: Record<string, number> = {
        อาทิตย์: 0, จันทร์: 1, อังคาร: 2, พุธ: 3, พฤหัสบดี: 4, พฤหัส: 4, ศุกร์: 5, เสาร์: 6,
      };
      const nowDow = new Date(now.getTime() + BKK_OFFSET_MS).getUTCDay();
      for (const [k, v] of Object.entries(dows)) {
        if (text.includes(k)) {
          let diff = (v - nowDow + 7) % 7;
          if (diff === 0) diff = 7;
          checkIn = dateStr(now, diff);
          break;
        }
      }
    }
  }
  if (!checkIn) return null;

  // nights: "N คืน" wins; else an explicit "ออก/ถึง <date>"; else 1.
  let nights = 1;
  const nm = text.match(/(\d{1,2})\s*คืน/);
  if (nm) {
    nights = Math.max(1, Math.min(60, +nm[1]));
  } else {
    const outMatch = text.match(/(?:ออก|ถึง|เช็คเอาท์|เช็กเอาท์)\s*(.*)$/);
    const outIso = outMatch ? explicitDate(outMatch[1], now) : null;
    if (outIso && outIso > checkIn) nights = nightsBetween(checkIn, outIso);
  }
  return { checkIn, checkOut: addDays(checkIn, nights), nights };
}
