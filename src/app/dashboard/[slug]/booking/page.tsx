import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listAppointments, listServices } from "@/db/repositories/booking";
import { listCustomers } from "@/db/repositories/customers";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import {
  createAppointmentAction,
  createServiceAction,
  deleteServiceAction,
  setAppointmentStatusAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "";
}
function statusClass(s: string) {
  if (s === "CONFIRMED" || s === "COMPLETED") return "paid";
  if (s === "PENDING") return "pending";
  return "handoff";
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const [services, appointments, customers] = await Promise.all([
    listServices(db, tenant.id),
    listAppointments(db, tenant.id, 100),
    listCustomers(db, tenant.id),
  ]);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>จองคิว / นัดหมาย</h1>
      {ok ? <p className="ok">บันทึกแล้ว</p> : null}
      {error === "slot" ? (
        <p className="error">ช่วงเวลานี้ถูกจองแล้ว เลือกเวลาอื่น</p>
      ) : error ? (
        <p className="error">ข้อมูลไม่ครบ ลองใหม่</p>
      ) : null}

      <h2>บริการที่จองได้</h2>
      {services.length === 0 ? (
        <p className="muted">ยังไม่มีบริการ — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>บริการ</th>
                <th>ระยะเวลา</th>
                <th>ราคา</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.durationMin} นาที</td>
                  <td>฿{Number(s.price).toLocaleString("th-TH")}</td>
                  <td>
                    <form action={deleteServiceAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="serviceId" value={s.id} />
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

      <form action={createServiceAction} className="card" style={{ marginTop: 12 }}>
        <input type="hidden" name="slug" value={slug} />
        <div className="row">
          <label style={{ flex: 2 }}>
            ชื่อบริการ
            <input name="name" required placeholder="เช่น ตัดผม / คอร์สโยคะ" />
          </label>
          <label style={{ flex: 1 }}>
            ระยะเวลา (นาที)
            <input name="durationMin" type="number" defaultValue={60} />
          </label>
          <label style={{ flex: 1 }}>
            ราคา (฿)
            <input name="price" type="number" step="0.01" placeholder="300" />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 10 }}>
          เพิ่มบริการ
        </button>
      </form>

      <h2>นัดหมาย</h2>
      {appointments.length === 0 ? (
        <p className="muted">ยังไม่มีนัดหมาย</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ลูกค้า</th>
                <th>บริการ</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>{when(a.startAt)}</td>
                  <td>{a.customerName ?? "-"}</td>
                  <td>{a.serviceName ?? "-"}</td>
                  <td>
                    <span className={`badge ${statusClass(a.status)}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    <form action={setAppointmentStatusAction} className="row">
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <select name="status" defaultValue={a.status}>
                        <option value="PENDING">PENDING</option>
                        <option value="CONFIRMED">CONFIRMED</option>
                        <option value="COMPLETED">COMPLETED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                      <button type="submit" className="sm ghost">
                        อัปเดต
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>เพิ่มนัดหมาย</h2>
      {customers.length === 0 ? (
        <p className="muted">ยังไม่มีลูกค้าในระบบ (ลูกค้าจะเกิดเมื่อทักเข้ามา)</p>
      ) : (
        <form action={createAppointmentAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <div className="row">
            <label style={{ flex: 1 }}>
              ลูกค้า
              <select name="customerId" required>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName ?? c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              บริการ
              <select name="serviceId">
                <option value="">— ไม่ระบุ —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin} นาที)
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              วันเวลา
              <input name="startAt" type="datetime-local" required />
            </label>
          </div>
          <label>
            หมายเหตุ
            <input name="note" placeholder="เช่น ขอช่างเอ" />
          </label>
          <button type="submit" style={{ marginTop: 10 }}>
            เพิ่มนัดหมาย
          </button>
        </form>
      )}
    </Shell>
  );
}
