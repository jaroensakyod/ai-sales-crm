/** Course/membership intent + matching for chat-driven enrolment. */
import { uniqueBestMatch } from "@/features/shared/match";

type CourseLike = { id: string; name: string; isActive?: boolean };

const ENROLL_KEYWORDS = [
  "สมัคร",
  "ลงคอร์ส",
  "ลงเรียน",
  "สมัครเรียน",
  "จองคอร์ส",
  "ลงชื่อเรียน",
  "enroll",
];
const QUERY_KEYWORDS = ["คอร์สอะไร", "มีคอร์ส", "เรียนอะไร", "คอร์สไหน", "มีสอน", "คอร์สบ้าง"];
const COURSE_HINT = ["คอร์ส", "เรียน", "สอน", "class", "รอบเรียน"];
const QUESTION_MARKERS = ["ยังไง", "ไหม", "มั้ย", "หรือเปล่า", "อย่างไร"];

export function hasEnrollIntent(text: string): boolean {
  const n = text.toLowerCase();
  if (QUESTION_MARKERS.some((q) => n.includes(q))) return false; // "สมัครยังไง" = a question
  return ENROLL_KEYWORDS.some((k) => n.includes(k));
}

export function isCourseQuery(text: string): boolean {
  const n = text.toLowerCase();
  return QUERY_KEYWORDS.some((k) => n.includes(k));
}

export function mentionsCourse(text: string): boolean {
  const n = text.toLowerCase();
  return COURSE_HINT.some((k) => n.includes(k));
}

/** Unique course match (partial names ok); null if none/ambiguous. */
export function matchCourse<T extends CourseLike>(text: string, courses: T[]): T | null {
  const active = courses.filter((c) => c.isActive !== false);
  return uniqueBestMatch(text, active, (c) => c.name);
}
