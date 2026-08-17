/**
 * Make the demo-store showcase EVERY module: unlock the Business plan + all
 * business types, and seed sample data for hotel / course / booking (keeps the
 * existing catalog products). Idempotent — only adds a module's samples when it
 * has none. Run:
 *   node --env-file=.env --import tsx scripts/demo-all-modules.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import { createService, listServices } from "@/db/repositories/booking";
import { createCourse, listCourses } from "@/db/repositories/course";
import { createRoom, listRooms } from "@/db/repositories/hotel";
import { setPlan } from "@/db/repositories/subscriptions";
import { getTenantBySlug, updateTenant } from "@/db/repositories/tenants";

const SLUG = "demo-store";

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  // Business plan unlocks hotel + course + broadcast + webhooks even with
  // AUTH_ENABLED on; all four business types so every menu shows.
  await setPlan(db, tenant.id, "BUSINESS");
  await updateTenant(db, tenant.id, {
    businessTypes: ["CATALOG", "BOOKING", "HOTEL", "COURSE"],
  });
  console.log("plan → BUSINESS · businessTypes → all four");

  // Booking services (BaZi-themed) ---------------------------------------
  if ((await listServices(db, tenant.id)).length === 0) {
    await createService(db, tenant.id, {
      name: "ดูดวงส่วนตัวตัวต่อตัว (กับซินแส)",
      durationMin: 60,
      price: "1500",
      description: "นัดปรึกษาดวงจีนแบบตัวต่อตัว 1 ชั่วโมง",
    });
    await createService(db, tenant.id, {
      name: "ปรึกษาฮวงจุ้ยบ้าน/ที่ทำงาน",
      durationMin: 90,
      price: "2500",
      description: "วิเคราะห์ทิศทาง การจัดวาง เสริมดวงการเงิน/การงาน",
    });
    console.log("+ 2 booking services");
  }

  // Course module --------------------------------------------------------
  if ((await listCourses(db, tenant.id)).length === 0) {
    await createCourse(db, tenant.id, {
      name: "คอร์สเรียนดูดวงจีน BaZi (คลาสสด)",
      price: "4900",
      capacity: 30,
      schedule: "ทุกวันเสาร์ 10:00-12:00 (6 สัปดาห์)",
      description: "เรียนอ่านดวงจีนด้วยตัวเองตั้งแต่พื้นฐานถึงใช้งานจริง",
    });
    console.log("+ 1 course");
  }

  // Hotel module (generic rooms — to showcase the hotel feature) ----------
  if ((await listRooms(db, tenant.id)).length === 0) {
    await createRoom(db, tenant.id, {
      name: "ห้อง Deluxe",
      pricePerNight: "1200",
      quantity: 5,
      capacity: 2,
      description: "ห้องมาตรฐาน เตียงใหญ่ พร้อมอาหารเช้า",
    });
    await createRoom(db, tenant.id, {
      name: "ห้อง Suite",
      pricePerNight: "2500",
      quantity: 2,
      capacity: 3,
      description: "ห้องสวีทกว้างพิเศษ วิวเมือง พร้อมอ่างอาบน้ำ",
    });
    console.log("+ 2 hotel rooms");
  }

  await createDbSqlClient().end();
  console.log("done — demo store now showcases every module.");
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
