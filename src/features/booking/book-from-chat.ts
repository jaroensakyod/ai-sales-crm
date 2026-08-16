import type { DbClient } from "@/db/client";
import { createAppointment, listServices } from "@/db/repositories/booking";
import { matchHandoff } from "@/features/router/intent";

import { hasBookingIntent, matchService, parseThaiDateTime } from "./intent";

export type BookingChatResult = { appointmentId?: string; reply: string } | null;

/**
 * Rule-based booking from chat — the appointment counterpart of tryCheckout.
 * When the customer clearly wants to book a specific service at a specific time,
 * create a real appointment (with the same double-booking guard as the dashboard)
 * and confirm. Returns null when it's not a clear booking, so the AI keeps the
 * conversation going (e.g. to gather the service or time first).
 */
export async function tryBooking(
  db: DbClient,
  ctx: {
    tenantId: string;
    customerId: string;
    conversationId: string;
    channelId?: string;
    text: string;
    now?: Date;
  },
): Promise<BookingChatResult> {
  // Cancel/reschedule/complaint → a human, never auto-book.
  if (matchHandoff(ctx.text)) return null;
  if (!hasBookingIntent(ctx.text)) return null;

  const services = await listServices(db, ctx.tenantId);
  if (services.length === 0) return null; // not a service business
  const service = matchService(ctx.text, services);
  if (!service) return null; // no / ambiguous service → let the AI ask which

  const now = ctx.now ?? new Date();
  const start = parseThaiDateTime(ctx.text, now);
  if (!start) {
    // Service is clear but no time given — ask instead of guessing.
    return {
      reply: `รับจอง${service.name}ค่ะ สะดวกวันและเวลาไหนดีคะ (เช่น "พรุ่งนี้บ่าย 2 โมง")`,
    };
  }

  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const result = await createAppointment(db, ctx.tenantId, {
    serviceId: service.id,
    customerId: ctx.customerId,
    startAt: start,
    endAt: end,
  });
  if (!result.ok) {
    return {
      reply: `ขออภัยค่ะ ช่วงเวลานั้นคิว${service.name}เต็มแล้ว รบกวนเลือกเวลาอื่นได้ไหมคะ`,
    };
  }

  const when = start.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "full",
    timeStyle: "short",
  });
  const price = Number(service.price).toLocaleString("th-TH");
  return {
    appointmentId: result.appointmentId,
    reply:
      `จอง${service.name}เรียบร้อยค่ะ\n` +
      `วันเวลา ${when} น. (${service.durationMin} นาที)\n` +
      `ราคา ${price} บาท\n` +
      `รบกวนขอชื่อและเบอร์ติดต่อกลับด้วยนะคะ`,
  };
}
