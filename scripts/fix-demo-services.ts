/**
 * Replace the demo-store booking services with BaZi-themed ones (the old
 * massage/nail samples predate the reskin). Run:
 *   node --env-file=.env --import tsx scripts/fix-demo-services.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import {
  createService,
  deleteService,
  listServices,
} from "@/db/repositories/booking";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);

  const existing = await listServices(db, tenant.id);
  for (const s of existing) await deleteService(db, tenant.id, s.id);
  console.log(`removed ${existing.length} old services`);

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
  console.log("+ 2 BaZi services");

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
