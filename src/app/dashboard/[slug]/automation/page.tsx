import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listRules } from "@/db/repositories/automation";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { TRIGGER_LABELS, type Action, type Trigger } from "@/features/automation/types";

import {
  createAutomationAction,
  deleteAutomationAction,
  toggleAutomationAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function AutomationPage({
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

  const rules = await listRules(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>ระบบอัตโนมัติ</h1>
      <p className="muted">
        ตั้งกฎ “เมื่อเกิดเหตุการณ์ → ส่งข้อความติดตามอัตโนมัติ” (ส่งตามกฎ 24 ชม.ของ Meta)
      </p>

      {rules.length === 0 ? (
        <p className="muted">ยังไม่มีกฎ — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>เมื่อ</th>
                <th>ส่ง (หลัง)</th>
                <th>สถานะ</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const trigger = r.trigger as Trigger;
                const action = r.action as Action;
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{TRIGGER_LABELS[trigger.type] ?? trigger.type}</td>
                    <td>
                      {action.delayHours} ชม.
                      <br />
                      <span className="muted" style={{ fontSize: "0.8rem" }}>
                        {action.message.slice(0, 40)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.isActive ? "paid" : "handoff"}`}>
                        {r.isActive ? "เปิด" : "ปิด"}
                      </span>
                    </td>
                    <td>
                      <form action={toggleAutomationAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="ruleId" value={r.id} />
                        <button type="submit" className="ghost sm">
                          {r.isActive ? "ปิด" : "เปิด"}
                        </button>
                      </form>
                    </td>
                    <td>
                      <form action={deleteAutomationAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="ruleId" value={r.id} />
                        <button type="submit" className="danger sm">
                          ลบ
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>เพิ่มกฎอัตโนมัติ</h2>
      <form action={createAutomationAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          ชื่อกฎ
          <input name="name" placeholder="เช่น ขอบคุณหลังซื้อ" />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            เมื่อ
            <select name="trigger" defaultValue="ORDER_PAID">
              <option value="ORDER_CREATED">มีออเดอร์ใหม่</option>
              <option value="ORDER_PAID">ลูกค้าชำระเงินแล้ว</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            ส่งหลัง (ชั่วโมง)
            <input name="delayHours" type="number" defaultValue={72} />
          </label>
          <label style={{ flex: 1 }}>
            ประเภท
            <select name="category" defaultValue="PROMOTIONAL">
              <option value="PROMOTIONAL">เสนอขาย/โปรโมชัน</option>
              <option value="TRANSACTIONAL">อัปเดตออเดอร์</option>
            </select>
          </label>
        </div>
        <label>
          ข้อความ
          <textarea
            name="message"
            rows={3}
            required
            placeholder="เช่น ขอบคุณที่อุดหนุนค่ะ 🙏 มีสินค้าใหม่มาแนะนำ..."
          />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มกฎ
        </button>
      </form>
    </Shell>
  );
}
