import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listScheduledBroadcasts } from "@/db/repositories/broadcasts";
import { getConnectedLineChannel } from "@/db/repositories/line";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { broadcastLineAction, cancelScheduledBroadcastAction } from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "รอส่ง",
  SENT: "ส่งแล้ว",
  CANCELLED: "ยกเลิก",
  FAILED: "ล้มเหลว",
  SKIPPED: "ข้าม",
};

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
  const scheduled = await listScheduledBroadcasts(db, tenant.id);

  const okText: Record<string, string> = {
    "1": "ส่ง broadcast เรียบร้อยแล้ว ✅",
    scheduled: "ตั้งเวลายิงโปรฯ เรียบร้อยแล้ว ⏰",
    cancelled: "ยกเลิกรายการที่ตั้งเวลาไว้แล้ว",
  };
  const errText: Record<string, string> = {
    empty: "ยังไม่ได้พิมพ์ข้อความหรือใส่รูป",
    confirm: "ต้องติ๊กยืนยันก่อนส่ง",
    nochannel: "ยังไม่ได้เชื่อม LINE OA",
    send: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง",
    badtime: "เวลาที่ตั้งไม่ถูกต้อง (ต้องเป็นเวลาในอนาคต)",
  };

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>ยิงโปรโมชั่น LINE (Broadcast)</h1>
      <p className="muted">
        ส่งข้อความถึง <strong>ผู้ติดตาม LINE OA ทั้งหมด</strong> พร้อมกัน — ยิงทันทีหรือตั้งเวลาล่วงหน้าก็ได้
      </p>

      {ok ? <p className="ok">{okText[ok] ?? "เรียบร้อยแล้ว ✅"}</p> : null}
      {error ? <p className="error">{errText[error] ?? "เกิดข้อผิดพลาด"}</p> : null}

      <div className="card" style={{ marginBottom: 14, borderLeft: "3px solid #f0a" }}>
        <strong>⚠️ ก่อนยิง อ่านตรงนี้</strong>
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.88rem" }}>
          <li>ส่งแล้ว <strong>ยกเลิกไม่ได้</strong> — ถึงผู้ติดตามทุกคนทันที (ที่ตั้งเวลาไว้ยกเลิกได้ก่อนถึงเวลา)</li>
          <li>
            นับ <strong>โควตาข้อความรายเดือนของ LINE</strong> ต่อผู้รับ 1 คน = 1 ข้อความ
            (มีผู้ติดตาม 1,000 คน = ใช้โควตา 1,000)
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
            ลิงก์รูปแบนเนอร์โปรฯ (ถ้ามี — ส่งรูปก่อนข้อความ)
            <input
              name="imageUrl"
              type="url"
              placeholder="https://... (https + JPG/PNG, ไม่เกิน 10MB)"
            />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              โปรฯ ที่มีรูปแบนเนอร์ ลูกค้าสนใจมากกว่าข้อความเปล่า
            </span>
          </label>
          <label>
            ข้อความที่จะส่ง (ข้อความล้วน ไม่ต้องใส่ Markdown)
            <textarea
              name="message"
              rows={5}
              maxLength={4900}
              placeholder={
                "เช่น โปรเดือนนี้! ลิปสติกทุกสี ลด 20% ถึงสิ้นเดือนนี้เท่านั้น ทักมาสั่งได้เลยค่ะ 🎉"
              }
            />
          </label>
          <label>
            ตั้งเวลายิง (เวลาไทย) — เว้นว่าง = ยิงทันที
            <input name="scheduledAt" type="datetime-local" />
          </label>
          <label className="inline" style={{ marginTop: 8 }}>
            <input type="checkbox" name="confirm" />
            ยืนยันส่งถึงผู้ติดตามทั้งหมด (เข้าใจว่ายิงแล้วยกเลิกไม่ได้และนับโควตา)
          </label>
          <button type="submit" className="danger" style={{ marginTop: 12 }}>
            ยิง / ตั้งเวลา broadcast
          </button>
        </form>
      )}

      {scheduled.length > 0 ? (
        <>
          <h2>รายการ broadcast</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>เวลา (ไทย)</th>
                  <th>ข้อความ</th>
                  <th>รูป</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((b) => (
                  <tr key={b.id}>
                    <td className="muted" style={{ fontSize: "0.82rem" }}>
                      {b.scheduledAt.toLocaleString("th-TH", {
                        timeZone: "Asia/Bangkok",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {(b.text ?? "").slice(0, 40) || "—"}
                    </td>
                    <td>{b.imageUrl ? "🖼️" : "—"}</td>
                    <td>
                      <span
                        className={`badge ${b.status === "SENT" ? "paid" : b.status === "SCHEDULED" ? "open" : "handoff"}`}
                      >
                        {STATUS_LABEL[b.status] ?? b.status}
                      </span>
                    </td>
                    <td>
                      {b.status === "SCHEDULED" ? (
                        <form action={cancelScheduledBroadcastAction}>
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="broadcastId" value={b.id} />
                          <button type="submit" className="ghost sm">
                            ยกเลิก
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Shell>
  );
}
