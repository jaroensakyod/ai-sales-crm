import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { getTenantBySlug } from "@/db/repositories/tenants";

import { clearWelcomeBannerAction, saveWelcomeBannerAction } from "../../actions";

export const dynamic = "force-dynamic";

/** Content only (no Shell) — rendered inside the combined /marketing page. */
export async function WelcomeSection({
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
  const settings = await getTenantAiSettings(db, tenant.id);

  return (
    <>
      <h1>หน้าต้อนรับ / โปรโมท</h1>
      <p className="muted">
        ตั้งรูปโปรโมทไว้ — พอลูกค้าทักแรกด้วยคำว่า “สวัสดี” หรือถาม “มีสินค้าอะไรบ้าง”
        บอทจะส่งรูปนี้กลับให้ทันที โดยลูกค้าไม่ต้องขอดูรูปเอง
      </p>

      {ok === "saved" ? <p className="ok">บันทึกแล้ว</p> : null}
      {ok === "cleared" ? <p className="ok">ปิดหน้าต้อนรับแล้ว</p> : null}
      {error === "storage" ? (
        <p className="error">ยังไม่ได้ตั้งค่าที่เก็บรูป (SUPABASE_URL / SERVICE_ROLE_KEY)</p>
      ) : null}
      {error === "upload" ? <p className="error">อัปโหลดรูปไม่สำเร็จ — JPG/PNG/WEBP ≤ 5MB</p> : null}

      {settings?.welcomeImageUrl ? (
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="muted" style={{ marginBottom: 6 }}>รูปโปรโมทปัจจุบัน</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings.welcomeImageUrl}
            alt="promo banner"
            style={{ width: "100%", borderRadius: 8 }}
          />
          {settings.welcomeMessage ? (
            <p style={{ marginTop: 8 }}>{settings.welcomeMessage}</p>
          ) : null}
          <form action={clearWelcomeBannerAction} style={{ marginTop: 8 }}>
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="danger sm">
              ปิดหน้าต้อนรับ (ลบรูป)
            </button>
          </form>
        </div>
      ) : (
        <p className="muted">ยังไม่ได้ตั้งรูปโปรโมท — เพิ่มด้านล่างได้เลย</p>
      )}

      <h2>{settings?.welcomeImageUrl ? "เปลี่ยนรูป / ข้อความ" : "ตั้งรูปโปรโมท"}</h2>
      <form action={saveWelcomeBannerAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          รูปโปรโมท (JPG / PNG / WEBP ≤ 5MB){settings?.welcomeImageUrl ? " — เว้นว่างถ้าไม่เปลี่ยนรูป" : ""}
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
        <label>
          ข้อความใต้รูป (ถ้ามี)
          <textarea
            name="message"
            rows={2}
            defaultValue={settings?.welcomeMessage ?? ""}
            placeholder="เช่น สวัสดีค่า ทางร้านมีคู่มือดวงจีนเฉพาะบุคคล ทักสอบถามได้เลยนะคะ"
          />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          บันทึก
        </button>
      </form>
    </>
  );
}

/** Old standalone route → now merged into /marketing. */
export default async function WelcomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/marketing`);
}
