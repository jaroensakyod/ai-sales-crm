import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getConnectedLineChannel } from "@/db/repositories/line";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { broadcastLineAction } from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function BroadcastPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "manage_settings");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const line = await getConnectedLineChannel(db, tenant.id);

  const errText: Record<string, string> = {
    empty: "ยังไม่ได้พิมพ์ข้อความ",
    confirm: "ต้องติ๊กยืนยันก่อนส่ง",
    nochannel: "ยังไม่ได้เชื่อม LINE OA",
    send: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง",
  };

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>ยิงโปรโมชั่น LINE (Broadcast)</h1>
      <p className="muted">
        ส่งข้อความถึง <strong>ผู้ติดตาม LINE OA ทั้งหมด</strong> พร้อมกัน — เหมาะกับโปรโมชั่น/ของใหม่/ประกาศร้าน
      </p>

      {ok ? <p className="ok">ส่งข้อความ broadcast เรียบร้อยแล้ว ✅</p> : null}
      {error ? <p className="error">{errText[error] ?? "เกิดข้อผิดพลาด"}</p> : null}

      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid #f0a" }}>
        <strong>⚠️ ก่อนยิง อ่านตรงนี้</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.88rem" }}>
          <li>ส่งแล้ว <strong>ยกเลิกไม่ได้</strong> — ถึงผู้ติดตามทุกคนทันที</li>
          <li>
            นับ <strong>โควตาข้อความรายเดือนของ LINE</strong> ต่อผู้รับ 1 คน = 1 ข้อความ
            (มีผู้ติดตาม 1,000 คน = ใช้โควตา 1,000) — เช็กโควตาในแผน LINE OA ของร้าน
          </li>
          <li>ส่งบ่อยเกินไปคนจะบล็อก/เลิกติดตาม — แนะนำเฉพาะโปรฯ สำคัญ</li>
          <li>Facebook ยิงโปรฯ อิสระไม่ได้ (ติดกฎ 24 ชม.) — หน้านี้สำหรับ LINE เท่านั้น</li>
        </ul>
      </div>

      {!line ? (
        <p className="muted">
          ยังไม่ได้เชื่อม LINE OA — ไปที่หน้า “ตั้งค่า” เพื่อเชื่อมก่อน แล้วจึงยิง broadcast ได้
        </p>
      ) : (
        <form action={broadcastLineAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ข้อความที่จะส่ง (ข้อความล้วน ไม่ต้องใส่ Markdown)
            <textarea
              name="message"
              rows={5}
              required
              maxLength={4900}
              placeholder={
                "เช่น โปรเดือนนี้! ลิปสติกทุกสี ลด 20% ถึงสิ้นเดือนนี้เท่านั้น ทักมาสั่งได้เลยค่ะ 🎉"
              }
            />
          </label>
          <label className="inline" style={{ marginTop: 8 }}>
            <input type="checkbox" name="confirm" />
            ยืนยันส่งถึงผู้ติดตามทั้งหมด (เข้าใจว่ายกเลิกไม่ได้และนับโควตา)
          </label>
          <button type="submit" className="danger" style={{ marginTop: 12 }}>
            ยิง broadcast เลย
          </button>
        </form>
      )}
    </Shell>
  );
}
