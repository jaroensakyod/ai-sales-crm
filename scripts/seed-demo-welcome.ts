/**
 * Set a demo promo banner for demo-store (auto-sent on the first greeting).
 * Run: node --env-file=.env --import tsx scripts/seed-demo-welcome.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import { updateTenantAiSettings } from "@/db/repositories/ai";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);

  await updateTenantAiSettings(db, tenant.id, {
    welcomeImageUrl:
      "https://lh3.googleusercontent.com/d/1kpBdEwCJ67FYI_wzNYzB0yuPy3S4uniZ=w600",
    welcomeMessage:
      "สวัสดีค่า ทางร้านมีคู่มือดวงจีนเฉพาะบุคคล Your Life Code วิเคราะห์จากวันเกิดโดยซินแสเซียนปลาน้อย สนใจแพ็กเกจไหนสอบถามได้เลยนะคะ",
  });
  console.log("welcome banner set for demo-store");

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
