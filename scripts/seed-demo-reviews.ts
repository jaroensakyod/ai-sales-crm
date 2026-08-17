/**
 * Seed a few demo reviews for demo-store (idempotent-ish: skips if any exist).
 * Run: node --env-file=.env --import tsx scripts/seed-demo-reviews.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import {
  createReview,
  deleteReview,
  listReviews,
} from "@/db/repositories/reviews";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";
const drive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w600`;

// Reviews are review images (screenshots); caption/author are optional extras.
const REVIEWS = [
  {
    imageUrl: drive("1vaqaZ1shcGKE6fSU5SHg-zaydhceitxG"),
    caption: "แม่นมากค่ะ อ่านแล้วเข้าใจตัวเองขึ้นเยอะ",
    authorName: "คุณเอ",
  },
  {
    imageUrl: drive("1V95XTFRO2ria_Vu-Mj-X6DrBKMalBmiN"),
    caption: "ตัดสินใจเรื่องงานได้ดีขึ้นเยอะหลังอ่าน คุ้มค่ามาก",
    authorName: "คุณบี",
  },
  {
    imageUrl: drive("1oZyjy0-a7DKyB_4ak_UsfwzxtrhXFZlG"),
    caption: "ไม่เหมือนหนังสือดูดวงทั่วไป เพราะวิเคราะห์จากวันเกิดเราจริงๆ",
    authorName: "คุณซี",
  },
];

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);

  // Replace any existing demo reviews with the image-based ones.
  for (const r of await listReviews(db, tenant.id)) {
    await deleteReview(db, tenant.id, r.id);
  }
  for (const r of REVIEWS) {
    const res = await createReview(db, tenant.id, r);
    console.log(res.ok ? `+ review by ${r.authorName}` : `! ${res.reason}`);
  }

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
