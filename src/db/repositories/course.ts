import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { courseEnrollments, courses, customers } from "@/db/schema";

// ---- Courses -------------------------------------------------------------

export async function listCourses(db: DbClient, tenantId: string) {
  return db
    .select()
    .from(courses)
    .where(eq(courses.tenantId, tenantId))
    .orderBy(asc(courses.name));
}

export async function createCourse(
  db: DbClient,
  tenantId: string,
  input: {
    name: string;
    price: string;
    capacity: number;
    schedule?: string | null;
    description?: string | null;
    imageUrl?: string | null;
  },
) {
  await db.insert(courses).values({ tenantId, ...input });
}

export async function deleteCourse(db: DbClient, tenantId: string, id: string) {
  await db
    .delete(courses)
    .where(and(eq(courses.tenantId, tenantId), eq(courses.id, id)));
}

// ---- Seats / enrolment ---------------------------------------------------

/** Active (PENDING/CONFIRMED) enrolments in a course. */
export async function countEnrolled(
  db: DbClient,
  tenantId: string,
  courseId: string,
): Promise<number> {
  const rows = await db
    .select({ id: courseEnrollments.id })
    .from(courseEnrollments)
    .where(
      and(
        eq(courseEnrollments.tenantId, tenantId),
        eq(courseEnrollments.courseId, courseId),
        inArray(courseEnrollments.status, ["PENDING", "CONFIRMED"]),
      ),
    );
  return rows.length;
}

/** Every course with its seats-left count (for the dashboard + chat listing). */
export async function courseSeatStatus(db: DbClient, tenantId: string) {
  const list = await listCourses(db, tenantId);
  const out: {
    course: (typeof list)[number];
    enrolled: number;
    seatsLeft: number;
  }[] = [];
  for (const course of list) {
    const enrolled = await countEnrolled(db, tenantId, course.id);
    out.push({ course, enrolled, seatsLeft: course.capacity - enrolled });
  }
  return out;
}

export type EnrollResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; reason: "full" };

/** Enrol a student, re-checking seats so a course never goes over capacity. */
export async function enrollStudent(
  db: DbClient,
  tenantId: string,
  input: {
    course: { id: string; capacity: number };
    customerId: string;
    conversationId?: string | null;
  },
): Promise<EnrollResult> {
  const enrolled = await countEnrolled(db, tenantId, input.course.id);
  if (enrolled >= input.course.capacity) return { ok: false, reason: "full" };

  const [row] = await db
    .insert(courseEnrollments)
    .values({
      tenantId,
      courseId: input.course.id,
      customerId: input.customerId,
      conversationId: input.conversationId,
    })
    .returning();
  return { ok: true, enrollmentId: row.id };
}

export async function listEnrollments(db: DbClient, tenantId: string, limit = 100) {
  return db
    .select({
      id: courseEnrollments.id,
      status: courseEnrollments.status,
      createdAt: courseEnrollments.createdAt,
      courseName: courses.name,
      customerName: customers.displayName,
    })
    .from(courseEnrollments)
    .leftJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .leftJoin(customers, eq(courseEnrollments.customerId, customers.id))
    .where(eq(courseEnrollments.tenantId, tenantId))
    .orderBy(desc(courseEnrollments.createdAt))
    .limit(limit);
}
