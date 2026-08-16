import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listTags } from "@/db/repositories/tags";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { PRESET_TAGS } from "@/features/tags/presets";

import {
  addPresetTagAction,
  createTagAction,
  deleteTagAction,
  toggleTagAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function TagsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "manage_settings");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const tags = await listTags(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>แท็กคุมคำตอบ AI (Tag + RAG)</h1>
      <p className="muted">
        เมื่อข้อความลูกค้าตรงกับ “คำที่จับ” ระบบจะบังคับให้ AI ตอบตาม “แนวทาง” ที่ตั้งไว้
        (แม่นกว่าปล่อย AI อิสระ) — ใช้ได้ทั้ง LINE และ Facebook
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <strong>แท็กสำเร็จรูป (กดเพิ่มได้เลย แล้วแก้ทีหลัง)</strong>
        <div className="row" style={{ marginTop: 10 }}>
          {PRESET_TAGS.map((p) => (
            <form key={p.key} action={addPresetTagAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="presetKey" value={p.key} />
              <button type="submit" className="ghost sm">
                + {p.name}
              </button>
            </form>
          ))}
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="muted">ยังไม่มีแท็ก — กดแท็กสำเร็จรูปด้านบน หรือเพิ่มเองด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>แท็ก</th>
                <th>คำที่จับ</th>
                <th>แนวทางที่ให้ AI ตอบ</th>
                <th>สถานะ</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>
                    {t.keywords.join(", ")}
                  </td>
                  <td style={{ fontSize: "0.85rem" }}>{t.guidance}</td>
                  <td>
                    <span className={`badge ${t.isActive ? "paid" : "handoff"}`}>
                      {t.isActive ? "เปิด" : "ปิด"}
                    </span>
                  </td>
                  <td>
                    <form action={toggleTagAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="tagId" value={t.id} />
                      <button type="submit" className="ghost sm">
                        {t.isActive ? "ปิด" : "เปิด"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={deleteTagAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="tagId" value={t.id} />
                      <button type="submit" className="danger sm">
                        ลบ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>เพิ่มแท็ก</h2>
      <form action={createTagAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          ชื่อแท็ก
          <input name="name" required placeholder="เช่น ถามจัดส่ง / ต่อราคา / ถามโปร" />
        </label>
        <label>
          คำที่จับ (คั่นด้วย , — เจอคำใดคำหนึ่งถือว่าตรง)
          <input name="keywords" required placeholder="ส่ง, กี่วัน, ค่าส่ง, จัดส่ง" />
        </label>
        <label>
          แนวทางที่ให้ AI ตอบ (บังคับ AI ตอบตามนี้)
          <textarea
            name="guidance"
            rows={3}
            required
            placeholder="เช่น บอกว่าจัดส่ง Flash 2-3 วันทำการ ค่าส่ง 40 บาท ส่งฟรีเมื่อซื้อครบ 500 แล้วชวนให้สั่งเลย"
          />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มแท็ก
        </button>
      </form>
    </Shell>
  );
}
