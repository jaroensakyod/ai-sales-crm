import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import {
  listWebhookEndpoints,
  recentDeliveries,
  WEBHOOK_EVENTS,
} from "@/db/repositories/webhooks";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  toggleWebhookEndpointAction,
} from "../../actions";
import { Shell } from "../_components/shell";
import { UpgradeNotice } from "../_components/upgrade-notice";

export const dynamic = "force-dynamic";

function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "";
}

export default async function WebhooksPage({
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

  if (!(await getEntitlements(db, tenant.id)).apiWebhooks) {
    return (
      <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
        <UpgradeNotice
          slug={slug}
          title="API / Webhook"
          plan="Max (฿990)"
          desc="ให้ระบบยิงแจ้งเหตุการณ์ (ออเดอร์ใหม่ · ชำระเงิน · จอง) ไปยัง URL ของระบบร้านคุณแบบเรียลไทม์ พร้อมลายเซ็นตรวจสอบ — อยู่ในแผน Max ขึ้นไป"
        />
      </Shell>
    );
  }

  const [endpoints, deliveries] = await Promise.all([
    listWebhookEndpoints(db, tenant.id),
    recentDeliveries(db, tenant.id),
  ]);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>API / Webhook</h1>
      <p className="muted">
        แจ้งเหตุการณ์ในร้านไปยังระบบของคุณแบบเรียลไทม์ — เราจะ POST ข้อมูล JSON
        พร้อมลายเซ็น ( header <code>X-Webhook-Signature</code>) ไปที่ URL ที่ตั้งไว้
      </p>

      {ok === "created" ? <p className="ok">เพิ่ม endpoint แล้ว — คัดลอก secret ไว้ตรวจลายเซ็น</p> : null}
      {ok === "deleted" ? <p className="ok">ลบ endpoint แล้ว</p> : null}
      {ok === "updated" ? <p className="ok">อัปเดตแล้ว</p> : null}
      {error === "url" ? <p className="error">URL ต้องขึ้นต้นด้วย https://</p> : null}

      <h2>เพิ่ม Endpoint</h2>
      <form action={createWebhookEndpointAction} className="row" style={{ alignItems: "end" }}>
        <input type="hidden" name="slug" value={slug} />
        <label style={{ margin: 0, flex: 1 }}>
          URL ปลายทาง (https://)
          <input name="url" type="url" placeholder="https://your-system.com/webhooks/aicrm" required />
        </label>
        <button type="submit">เพิ่ม</button>
      </form>

      <h2>Endpoints</h2>
      {endpoints.length === 0 ? (
        <p className="muted">ยังไม่มี endpoint</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Signing secret</th>
                <th>สถานะ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((e) => (
                <tr key={e.id}>
                  <td style={{ wordBreak: "break-all" }}>{e.url}</td>
                  <td>
                    <code style={{ fontSize: "0.78rem" }}>{e.secret}</code>
                  </td>
                  <td>
                    <span className={`badge ${e.active ? "paid" : "handoff"}`}>
                      {e.active ? "เปิด" : "ปิด"}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <form action={toggleWebhookEndpointAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="endpointId" value={e.id} />
                        {e.active ? null : (
                          <input type="hidden" name="active" value="on" />
                        )}
                        <button type="submit" className="ghost sm">
                          {e.active ? "ปิด" : "เปิด"}
                        </button>
                      </form>
                      <form action={deleteWebhookEndpointAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="endpointId" value={e.id} />
                        <button type="submit" className="danger sm">
                          ลบ
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>เหตุการณ์ที่ส่ง</h2>
      <p className="muted">
        {WEBHOOK_EVENTS.map((ev) => (
          <code key={ev} style={{ marginRight: 8 }}>
            {ev}
          </code>
        ))}
      </p>

      <h2>การส่งล่าสุด</h2>
      {deliveries.length === 0 ? (
        <p className="muted">ยังไม่มีการส่ง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เหตุการณ์</th>
                <th>สถานะ</th>
                <th>ตอบกลับ</th>
                <th>ครั้งที่ลอง</th>
                <th>เวลา</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td><code>{d.event}</code></td>
                  <td>
                    <span
                      className={`badge ${
                        d.status === "SENT" ? "paid" : d.status === "FAILED" ? "handoff" : "pending"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td>{d.responseStatus ?? (d.lastError ? "err" : "-")}</td>
                  <td>{d.attempts}</td>
                  <td>{when(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>ตรวจลายเซ็น</h2>
      <p className="muted">
        เราส่ง header <code>X-Webhook-Signature: sha256=&lt;hex&gt;</code> คำนวณจาก
        HMAC-SHA256 ของ body ด้วย signing secret ของ endpoint — ฝั่งคุณคำนวณซ้ำแล้วเทียบ
        เพื่อยืนยันว่ามาจากเราจริง
      </p>
    </Shell>
  );
}
