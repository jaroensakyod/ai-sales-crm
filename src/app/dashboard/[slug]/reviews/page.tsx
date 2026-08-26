import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { listReviews, REVIEW_CAP } from "@/db/repositories/reviews";
import { getTenantBySlug } from "@/db/repositories/tenants";

import {
  addReviewAction,
  deleteReviewAction,
  updateReviewStyleAction,
} from "../../actions";

export const dynamic = "force-dynamic";

/** Content only (no Shell) — rendered inside the combined /marketing page. */
export async function ReviewsSection({
  slug,
  ok,
  error,
}: {
  slug: string;
  ok?: string;
  error?: string;
}) {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) return null;

  const reviews = await listReviews(db, tenant.id);
  const full = reviews.length >= REVIEW_CAP;
  const settings = await getTenantAiSettings(db, tenant.id);
  const imagedCount = reviews.filter((r) => r.imageUrl).length;

  return (
    <>
      <h1>รีวิวลูกค้า</h1>
      <p className="muted">
        อัปโหลดรูปรีวิว/แคปหน้าจอ — บอทจะส่งให้ลูกค้าเมื่อถามหารีวิว ·{" "}
        <b>{reviews.length}/{REVIEW_CAP}</b> (จำกัดต่อร้านเพื่อไม่ให้ข้อมูลบวม)
      </p>

      {ok === "added" ? <p className="ok">เพิ่มรีวิวแล้ว</p> : null}
      {ok === "deleted" ? <p className="ok">ลบรีวิวแล้ว</p> : null}
      {ok === "reviewstyle" ? <p className="ok">บันทึกสไตล์การ์ดรีวิวแล้ว</p> : null}

      <form action={updateReviewStyleAction} className="card" style={{ marginBottom: 16 }}>
        <input type="hidden" name="slug" value={slug} />
        <label>
          สไตล์การ์ดรีวิว (เมื่อมีรีวิวรูปตั้งแต่ 2 อัน บอทจะส่งเป็นการ์ด Flex เลื่อนดูได้)
          <select name="reviewCardStyle" defaultValue={settings?.reviewCardStyle ?? "plain"}>
            <option value="plain">เรียบ (Plain)</option>
            <option value="promo">โปรโมชั่น (สีส้ม)</option>
            <option value="minimal">มินิมอล</option>
          </select>
        </label>
        <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 8px" }}>
          ตอนนี้มีรีวิวที่มีรูป {imagedCount} อัน{" "}
          {imagedCount >= 2 ? "→ จะส่งเป็นการ์ด Flex" : "(ต้องมี 2 อันขึ้นไปถึงจะเป็นการ์ด)"}
        </p>
        <button type="submit" className="sm">
          บันทึกสไตล์
        </button>
      </form>
      {error === "cap" ? (
        <p className="error">ครบจำนวนสูงสุด {REVIEW_CAP} รีวิวแล้ว — ลบตัวเก่าก่อนถึงจะเพิ่มได้</p>
      ) : null}
      {error === "empty" ? <p className="error">ต้องเลือกรูปรีวิวก่อน</p> : null}
      {error === "storage" ? (
        <p className="error">ยังไม่ได้ตั้งค่าที่เก็บรูป (SUPABASE_URL / SERVICE_ROLE_KEY)</p>
      ) : null}
      {error === "upload" ? <p className="error">อัปโหลดรูปไม่สำเร็จ — JPG/PNG/WEBP ≤ 5MB</p> : null}

      {reviews.length === 0 ? (
        <p className="muted">ยังไม่มีรีวิว</p>
      ) : (
        <div className="grid">
          {reviews.map((r) => (
            <div key={r.id} className="card">
              {r.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.imageUrl}
                  alt={r.authorName ?? "review"}
                  style={{ width: "100%", borderRadius: 8, marginBottom: 8 }}
                />
              ) : null}
              {r.caption ? <p style={{ margin: "0 0 6px" }}>&ldquo;{r.caption}&rdquo;</p> : null}
              {r.authorName ? <div className="muted" style={{ fontSize: "0.85rem" }}>— {r.authorName}</div> : null}
              <form action={deleteReviewAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="reviewId" value={r.id} />
                <button type="submit" className="danger sm">
                  ลบ
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <h2>เพิ่มรีวิว</h2>
      {full ? (
        <p className="muted">ครบ {REVIEW_CAP} รีวิวแล้ว — ลบตัวเก่าก่อนถึงจะเพิ่มได้</p>
      ) : (
        <form action={addReviewAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            รูปรีวิว / แคปหน้าจอ (จำเป็น · JPG / PNG / WEBP ≤ 5MB)
            <input
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </label>
          <label>
            คำบรรยายใต้รูป (ถ้ามี)
            <textarea name="caption" rows={2} placeholder="เช่น แม่นมาก อ่านแล้วเข้าใจตัวเองขึ้นเยอะ" />
          </label>
          <label>
            ชื่อลูกค้า (ถ้ามี)
            <input name="authorName" placeholder="เช่น คุณเอ" />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            เพิ่มรีวิว
          </button>
        </form>
      )}
    </>
  );
}

/** Old standalone route → now merged into /marketing. */
export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/marketing`);
}
