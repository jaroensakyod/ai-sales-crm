import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  listHotelBookings,
  listRooms,
  roomStatus,
} from "@/db/repositories/hotel";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import { createRoomAction, deleteRoomAction } from "../../actions";
import { KnowledgeSection } from "../_components/knowledge-section";
import { Shell } from "../_components/shell";
import { UpgradeNotice } from "../_components/upgrade-notice";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "รอยืนยัน",
  CONFIRMED: "ยืนยันแล้ว",
  CANCELLED: "ยกเลิก",
  COMPLETED: "เข้าพักแล้ว",
};

function fmt(iso: string) {
  return new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  });
}

function bkkToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function HotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { date, ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "edit_sales");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  if (!(await getEntitlements(db, tenant.id)).hotelModule) {
    return (
      <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
        <UpgradeNotice
          slug={slug}
          title="โรงแรม / ห้องพัก"
          plan="Max (฿990)"
          desc="ระบบเช็คห้องว่างตามวันที่ จองห้อง คิดยอดต่อคืน และดูห้องว่างแบบเรียลไทม์ อยู่ในแผนธุรกิจ/โรงแรม"
        />
      </Shell>
    );
  }

  const rooms = await listRooms(db, tenant.id);
  const bookings = await listHotelBookings(db, tenant.id);
  const statusDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bkkToday();
  const status = await roomStatus(db, tenant.id, statusDate, nextDay(statusDate));

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>โรงแรม / ห้องพัก</h1>
      <p className="muted">
        ตั้งประเภทห้อง + จำนวนห้อง + ราคา/คืน — บอทจะเช็คห้องว่างตามวันที่ และรับจองผ่านแชทให้อัตโนมัติ
        (กันจองเกินจำนวนห้อง)
      </p>

      <h2>สถานะห้องว่าง</h2>
      <form method="get" className="row" style={{ alignItems: "end", marginBottom: 10 }}>
        <label style={{ margin: 0 }}>
          ดูวันที่ (เข้าพักคืนนั้น)
          <input type="date" name="date" defaultValue={statusDate} />
        </label>
        <button type="submit" className="ghost sm">
          ดู
        </button>
      </form>
      {rooms.length === 0 ? (
        <p className="muted">ยังไม่มีห้อง — เพิ่มด้านล่างก่อน</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ห้อง</th>
                <th>ทั้งหมด</th>
                <th>จองแล้ว</th>
                <th>ว่าง</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {status.map(({ room, booked, available }) => (
                <tr key={room.id}>
                  <td>{room.name}</td>
                  <td>{room.quantity}</td>
                  <td>{booked}</td>
                  <td>
                    <strong>{available}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge ${available <= 0 ? "handoff" : available <= room.quantity / 2 ? "open" : "paid"}`}
                    >
                      {available <= 0 ? "เต็ม" : available <= room.quantity / 2 ? "เหลือน้อย" : "ว่าง"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>ประเภทห้อง</h2>
      {rooms.length === 0 ? (
        <p className="muted">ยังไม่มีห้อง — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ห้อง</th>
                <th>ราคา/คืน</th>
                <th>จำนวนห้อง</th>
                <th>จุคน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    {r.description ? (
                      <>
                        <br />
                        <span className="muted" style={{ fontSize: "0.82rem" }}>
                          {r.description}
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>{Number(r.pricePerNight).toLocaleString("th-TH")} บาท</td>
                  <td>{r.quantity}</td>
                  <td>{r.capacity}</td>
                  <td>
                    <form action={deleteRoomAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="roomId" value={r.id} />
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

      <h2>เพิ่มประเภทห้อง</h2>
      <form action={createRoomAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          ชื่อห้อง
          <input name="name" required placeholder="เช่น ห้องดีลักซ์ / Standard / Suite" />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            ราคา/คืน (บาท)
            <input name="pricePerNight" type="number" step="0.01" required placeholder="1200" />
          </label>
          <label style={{ flex: 1 }}>
            จำนวนห้องประเภทนี้
            <input name="quantity" type="number" min={1} defaultValue={1} />
          </label>
          <label style={{ flex: 1 }}>
            จุคน
            <input name="capacity" type="number" min={1} defaultValue={2} />
          </label>
        </div>
        <label>
          รายละเอียด (AI ใช้แนะนำ)
          <textarea name="description" rows={2} placeholder="เช่น วิวเมือง เตียงคิงไซส์ รวมอาหารเช้า" />
        </label>
        <label>
          ลิงก์รูปห้อง (URL)
          <input name="imageUrl" type="url" placeholder="https://... (https + JPG/PNG)" />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มห้อง
        </button>
      </form>

      <h2>การจองล่าสุด</h2>
      {bookings.length === 0 ? (
        <p className="muted">ยังไม่มีการจอง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ห้อง</th>
                <th>ผู้จอง</th>
                <th>เข้าพัก</th>
                <th>คืน</th>
                <th>ยอดรวม</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.roomName ?? "—"}</td>
                  <td>{b.customerName ?? "—"}</td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>
                    {fmt(b.checkIn)} – {fmt(b.checkOut)}
                  </td>
                  <td>{b.nights}</td>
                  <td>{Number(b.totalPrice).toLocaleString("th-TH")} บาท</td>
                  <td>
                    <span className={`badge ${b.status === "CONFIRMED" ? "paid" : "open"}`}>
                      {STATUS_LABEL[b.status] ?? b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <KnowledgeSection slug={slug} tenantId={tenant.id} category="hotel" back="hotel" label="โรงแรม" ok={ok} error={error} />
    </Shell>
  );
}
