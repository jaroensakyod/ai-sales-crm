import { describe, expect, it } from "vitest";

import {
  hasBookingIntent,
  matchService,
  parseThaiDateTime,
} from "@/features/booking/intent";

const SERVICES = [
  { id: "1", name: "นวดแผนไทย", durationMin: 60 },
  { id: "2", name: "ทำเล็บเจล", durationMin: 45 },
];

describe("booking intent", () => {
  it("detects a booking, ignores 'how to book' questions", () => {
    expect(hasBookingIntent("จองนวดแผนไทยพรุ่งนี้บ่าย 2 โมง")).toBe(true);
    expect(hasBookingIntent("นัดพรุ่งนี้ 10 โมง")).toBe(true);
    expect(hasBookingIntent("จองยังไงคะ")).toBe(false);
    expect(hasBookingIntent("สวัสดีค่ะ")).toBe(false);
  });

  it("matches a named service, null when unnamed/ambiguous", () => {
    expect(matchService("จองนวดแผนไทยพรุ่งนี้", SERVICES)?.id).toBe("1");
    expect(matchService("จองทำเล็บเจล", SERVICES)?.id).toBe("2");
    expect(matchService("จองนวด", SERVICES)).toBeNull(); // no full service name
  });
});

describe("parseThaiDateTime (Thailand wall-clock, tz-independent)", () => {
  // 2026-08-16T01:00:00Z = 08:00 Bangkok, a Sunday.
  const now = new Date("2026-08-16T01:00:00Z");
  const iso = (t: string) => parseThaiDateTime(t, now)?.toISOString();

  it("parses relative day + spoken time to the right instant", () => {
    expect(iso("พรุ่งนี้บ่าย 2 โมง")).toBe("2026-08-17T07:00:00.000Z"); // 14:00 ICT
    expect(iso("บ่ายโมง")).toBe("2026-08-16T06:00:00.000Z"); // 13:00 ICT
    expect(iso("2 ทุ่ม")).toBe("2026-08-16T13:00:00.000Z"); // 20:00 ICT
    expect(iso("15:30")).toBe("2026-08-16T08:30:00.000Z");
    expect(iso("10 โมงเช้า")).toBe("2026-08-16T03:00:00.000Z");
    expect(iso("เที่ยง")).toBe("2026-08-16T05:00:00.000Z");
  });

  it("rolls a passed time to tomorrow, and returns null without a time", () => {
    const evening = new Date("2026-08-16T10:00:00Z"); // 17:00 ICT
    expect(parseThaiDateTime("10 โมงเช้า", evening)?.toISOString()).toBe(
      "2026-08-17T03:00:00.000Z", // today 10:00 ICT already passed → tomorrow
    );
    expect(parseThaiDateTime("จองนวดแผนไทย", now)).toBeNull();
  });
});
