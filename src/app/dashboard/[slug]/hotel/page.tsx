import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listHotelBookings, listRooms } from "@/db/repositories/hotel";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { createRoomAction, deleteRoomAction } from "../../actions";
import { Shell } from "../_components/shell";

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

export default async function HotelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "edit_sales");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const rooms = await listRooms(db, tenant.id);
  const bookings = await listHotelBookings(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>โรงแรม / ห้องพัก</h1>
      <p className="muted">
        ตั้งประเภทห้อง + จำนวนห้อง + ราคา/คืน — บอทจะเช็คห้องว่างตามวันที่ และรับจองผ่านแชทให้อัตโนมัติ
        (กันจองเกินจำนวนห้อง)
      </p>

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
    </Shell>
  );
}
