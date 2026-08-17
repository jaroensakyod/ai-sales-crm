/**
 * Seed a few demo reviews for demo-store (idempotent-ish: skips if any exist).
 * Run: node --env-file=.env --import tsx scripts/seed-demo-reviews.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import { createReview, listReviews } from "@/db/repositories/reviews";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";
const drive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w600`;

const REVIEWS = [
  {
    imageUrl: drive("1vaqaZ1shcGKE6fSU5SHg-zaydhceitxG"),
    caption: "แม่นมากค่ะ อ่านแล้วเข้าใจตัวเองขึ้นเยอะ ซินแสวิเคราะห์ละเอียดจริง",
    authorName: "คุณเอ",
  },
  {
    caption: "ตัดสินใจเรื่องงานได้ดีขึ้นเยอะหลังอ่าน คุ้มค่ามากค่ะ",
    authorName: "คุณบี",
  },
  {
    caption: "ไม่เหมือนหนังสือดูดวงทั่วไป เพราะวิเคราะห์จากวันเกิดเราจริงๆ",
    authorName: "คุณซี",
  },
];

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);

  if ((await listReviews(db, tenant.id)).length > 0) {
    console.log("reviews already exist — skipping");
  } else {
    for (const r of REVIEWS) {
      const res = await createReview(db, tenant.id, r);
      console.log(res.ok ? `+ review by ${r.authorName}` : `! ${res.reason}`);
    }
  }

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
