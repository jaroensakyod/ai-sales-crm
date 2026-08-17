import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCourse } from "@/db/repositories/course";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { customers } from "@/db/schema";
import { tryCourseEnroll } from "@/features/course/enroll-from-chat";
import { matchCourse } from "@/features/course/intent";
import { uniqueBestMatch } from "@/features/shared/match";

const hasDb = !!process.env.DATABASE_URL;

describe("fuzzy match (LCS)", () => {
  const items = [
    { id: "1", name: "คอร์สโยคะเบื้องต้น" },
    { id: "2", name: "ภาษาอังกฤษ A1" },
  ];
  it("matches a partial Thai name, stays null on too-short/ambiguous", () => {
    expect(matchCourse("สมัครคอร์สโยคะ", items)?.id).toBe("1");
    expect(matchCourse("สมัครโยคะ", items)?.id).toBe("1");
    expect(matchCourse("สมัครอังกฤษ", items)?.id).toBe("2");
    expect(uniqueBestMatch("abc", items, (i) => i.name)).toBeNull();
  });
});

describe.skipIf(!hasDb)("course enrolment from chat (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, { name: "School", slug: `sch-${suffix}` });
    tenantId = tenant.id;
    await createCourse(db, tenantId, {
      name: "คอร์สโยคะเบื้องต้น",
      price: "2500",
      capacity: 2,
      schedule: "ทุกเสาร์ 10:00-12:00",
    });
    const [c] = await db
      .insert(customers)
      .values({ tenantId, displayName: "นักเรียน" })
      .returning();
    customerId = c.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  const ctx = (text: string) => ({ tenantId, customerId, text });

  it("lists courses with price + seats", async () => {
    const res = await tryCourseEnroll(db, ctx("มีคอร์สอะไรบ้างคะ"));
    expect(res?.reply).toContain("คอร์สโยคะเบื้องต้น");
    expect(res?.reply).toContain("2,500");
    expect(res?.reply).toContain("ว่าง 2");
  });

  it("enrols a student in a named course (partial name)", async () => {
    const res = await tryCourseEnroll(db, ctx("สมัครโยคะ"));
    expect(res?.enrollmentId).toBeTruthy();
    expect(res?.reply).toContain("เรียบร้อย");
    expect(res?.reply).toContain("ทุกเสาร์");
  });

  it("never enrols past capacity", async () => {
    const second = await tryCourseEnroll(db, ctx("สมัครโยคะ"));
    expect(second?.enrollmentId).toBeTruthy(); // 2nd of 2
    const third = await tryCourseEnroll(db, ctx("สมัครโยคะ"));
    expect(third?.enrollmentId).toBeUndefined(); // full
    expect(third?.reply).toContain("เต็มแล้ว");
  });
});
