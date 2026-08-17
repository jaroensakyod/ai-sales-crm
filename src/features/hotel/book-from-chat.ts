import type { DbClient } from "@/db/client";
import {
  createHotelBooking,
  listAvailableRooms,
  listRooms,
} from "@/db/repositories/hotel";
import { scheduleReminder } from "@/features/reminders/schedule";
import { matchHandoff } from "@/features/router/intent";

import {
  hasHotelBookingIntent,
  isAvailabilityQuery,
  matchRoom,
  mentionsStay,
  parseStay,
  tonightStay,
  type Stay,
} from "./intent";

export type HotelChatResult = { bookingId?: string; reply: string } | null;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  });
}
const baht = (n: number) => n.toLocaleString("th-TH");

/**
 * Hotel front-desk over chat: answer "any rooms free?" and take a real booking
 * ("จองดีลักซ์ 2 คืนพรุ่งนี้") with proper date-range availability (never
 * overbooks past a room type's quantity). The nightly total is computed from the
 * DB rate, never the AI. Returns null for general chat so the AI handles it.
 */
export async function tryHotelBooking(
  db: DbClient,
  ctx: {
    tenantId: string;
    customerId: string;
    conversationId?: string | null;
    channelId?: string;
    text: string;
    now?: Date;
  },
): Promise<HotelChatResult> {
  if (matchHandoff(ctx.text)) return null;
  const rooms = await listRooms(db, ctx.tenantId);
  if (rooms.length === 0) return null; // not a hotel

  const wantsBooking = hasHotelBookingIntent(ctx.text);
  const wantsAvail = isAvailabilityQuery(ctx.text);
  if (!wantsBooking && !wantsAvail && !mentionsStay(ctx.text)) return null;

  const now = ctx.now ?? new Date();
  const room = matchRoom(ctx.text, rooms);
  const stay = parseStay(ctx.text, now);

  // A concrete booking: room + dates known → create it (availability re-checked).
  if (wantsBooking && room && stay) {
    const result = await createHotelBooking(db, ctx.tenantId, {
      room: {
        id: room.id,
        quantity: room.quantity,
        pricePerNight: room.pricePerNight,
      },
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
    });
    if (!result.ok) {
      return {
        reply:
          `ขออภัยค่ะ ${room.name} ช่วง ${fmtDate(stay.checkIn)} – ${fmtDate(stay.checkOut)} ` +
          `เต็มแล้ว รบกวนลองวันอื่นหรือห้องประเภทอื่นได้ไหมคะ`,
      };
    }
    // Remind the day before check-in (2pm standard check-in time).
    if (ctx.channelId && ctx.conversationId) {
      await scheduleReminder(db, {
        tenantId: ctx.tenantId,
        customerId: ctx.customerId,
        conversationId: ctx.conversationId,
        channelId: ctx.channelId,
        at: new Date(`${stay.checkIn}T14:00:00+07:00`),
        text: `แจ้งเตือนการเข้าพักค่ะ พรุ่งนี้คุณมีจอง${room.name} เข้าพักวันที่ ${fmtDate(stay.checkIn)} นะคะ ทางโรงแรมรอต้อนรับค่ะ`,
        now,
      });
    }
    return {
      bookingId: result.bookingId,
      reply:
        `จอง${room.name}เรียบร้อยค่ะ\n` +
        `เข้าพัก ${fmtDate(stay.checkIn)} ถึง ${fmtDate(stay.checkOut)} (${stay.nights} คืน)\n` +
        `ยอดรวม ${baht(result.totalPrice)} บาท\n` +
        `รบกวนขอชื่อและเบอร์ติดต่อด้วยนะคะ`,
    };
  }

  // Booking a specific room but no dates → ask for them.
  if (wantsBooking && room && !stay) {
    return {
      reply: `รับจอง${room.name}ค่ะ เข้าพักวันไหน กี่คืนดีคะ (เช่น "พรุ่งนี้ 2 คืน")`,
    };
  }

  // Availability info (asked, or a booking that's missing the room). Use the
  // given dates, else assume tonight for an undated availability question.
  const check: Stay | null = stay ?? (wantsAvail ? tonightStay(now) : null);
  if (!check) return null; // can't help yet → let the AI ask

  const list = await listAvailableRooms(db, ctx.tenantId, check.checkIn, check.checkOut);
  const range = `${fmtDate(check.checkIn)} – ${fmtDate(check.checkOut)} (${check.nights} คืน)`;
  if (list.length === 0) {
    return { reply: `ขออภัยค่ะ ช่วง ${range} ห้องเต็มทุกประเภทเลยค่ะ` };
  }
  const lines = list
    .map(
      (x) =>
        `• ${x.room.name} ${baht(Number(x.room.pricePerNight))} บาท/คืน (ว่าง ${x.available} ห้อง)`,
    )
    .join("\n");
  return {
    reply:
      `ช่วง ${range} มีห้องว่างดังนี้ค่ะ\n${lines}\n` +
      `สนใจห้องไหนแจ้งได้เลย เช่น "จอง${list[0].room.name} ${check.nights} คืน"`,
  };
}
