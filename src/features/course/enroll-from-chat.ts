import type { DbClient } from "@/db/client";
import {
  courseSeatStatus,
  enrollStudent,
  listCourses,
} from "@/db/repositories/course";
import { matchHandoff } from "@/features/router/intent";

import {
  hasEnrollIntent,
  isCourseQuery,
  matchCourse,
  mentionsCourse,
} from "./intent";

export type CourseChatResult = { enrollmentId?: string; reply: string } | null;

const baht = (n: number) => n.toLocaleString("th-TH");

/**
 * Course/membership enrolment over chat — the course counterpart of tryBooking.
 * Lists courses with seats left, and enrols a student in a named course (never
 * over capacity). Returns null for general chat so the AI handles it.
 */
export async function tryCourseEnroll(
  db: DbClient,
  ctx: {
    tenantId: string;
    customerId: string;
    conversationId?: string | null;
    text: string;
  },
): Promise<CourseChatResult> {
  if (matchHandoff(ctx.text)) return null;
  const courses = await listCourses(db, ctx.tenantId);
  if (courses.length === 0) return null; // not a course business

  const wantsEnroll = hasEnrollIntent(ctx.text);
  const wantsList = isCourseQuery(ctx.text);
  if (!wantsEnroll && !wantsList && !mentionsCourse(ctx.text)) return null;

  const course = matchCourse(ctx.text, courses);

  // Enrol in a named course.
  if (wantsEnroll && course) {
    const result = await enrollStudent(db, ctx.tenantId, {
      course: { id: course.id, capacity: course.capacity },
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
    });
    if (!result.ok) {
      return {
        reply: `ขออภัยค่ะ ${course.name}เต็มแล้ว รบกวนสอบถามรอบถัดไปได้นะคะ`,
      };
    }
    const parts = [`สมัคร${course.name}เรียบร้อยค่ะ`];
    if (course.schedule) parts.push(`ตารางเรียน: ${course.schedule}`);
    parts.push(`ค่าเรียน ${baht(Number(course.price))} บาท`);
    parts.push("รบกวนขอชื่อและเบอร์ติดต่อด้วยนะคะ");
    return { enrollmentId: result.enrollmentId, reply: parts.join("\n") };
  }

  // List courses + seats (asked, or enrol without naming a course).
  const status = await courseSeatStatus(db, ctx.tenantId);
  const open = status.filter((s) => s.course.isActive);
  if (open.length === 0) {
    return { reply: "ตอนนี้ยังไม่มีคอร์สที่เปิดรับสมัครค่ะ" };
  }
  const lines = open
    .map((s) => {
      const sched = s.course.schedule ? ` (${s.course.schedule})` : "";
      const seats = s.seatsLeft > 0 ? `ว่าง ${s.seatsLeft} ที่นั่ง` : "เต็มแล้ว";
      return `• ${s.course.name} ${baht(Number(s.course.price))} บาท${sched} — ${seats}`;
    })
    .join("\n");
  return {
    reply:
      `คอร์สที่เปิดรับสมัครตอนนี้ค่ะ\n${lines}\n` +
      `สนใจคอร์สไหนแจ้งได้เลย เช่น "สมัคร${open[0].course.name}"`,
  };
}
