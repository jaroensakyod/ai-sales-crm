import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  getLeadScoreStats,
  getObjectionBreakdown,
} from "@/db/repositories/analytics";
import {
  bestSellers,
  customerInsights,
  peakHours,
} from "@/db/repositories/insights";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

const OBJECTION_LABEL: Record<string, string> = {
  PRICE: "ราคา",
  TRUST: "ความเชื่อมั่น",
  TIMING: "จังหวะเวลา",
  NEED: "ความจำเป็น",
  COMPETITOR: "คู่แข่ง",
  SHIPPING: "การจัดส่ง",
  OTHER: "อื่นๆ",
};

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const entitlements = await getEntitlements(db, tenant.id);
  const [ci, sellers, hours] = await Promise.all([
    customerInsights(db, tenant.id),
    bestSellers(db, tenant.id),
    peakHours(db, tenant.id),
  ]);
  const maxHour = Math.max(1, ...hours.map((h) => h.count));
  const busiest = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>วิเคราะห์ลูกค้า</h1>
      <p className="muted">ภาพรวมลูกค้าของร้าน · รีเซ็ตยอด "เดือนนี้" ต้นเดือนอัตโนมัติ</p>

      <div className="grid">
        <div className="card kpi">
          <div className="label">ลูกค้าทั้งหมด</div>
          <div className="value">{ci.totalCustomers.toLocaleString("th-TH")}</div>
        </div>
        <div className="card kpi">
          <div className="label">ลูกค้าใหม่เดือนนี้</div>
          <div className="value">{ci.newThisMonth.toLocaleString("th-TH")}</div>
        </div>
        <div className="card kpi">
          <div className="label">ข้อความเข้าเดือนนี้</div>
          <div className="value">{ci.messagesThisMonth.toLocaleString("th-TH")}</div>
        </div>
        <div className="card kpi">
          <div className="label">ยินยอมเก็บข้อมูล (PDPA)</div>
          <div className="value">{ci.consentCount.toLocaleString("th-TH")}</div>
          <div className="sub">จาก {ci.totalCustomers.toLocaleString("th-TH")} คน</div>
        </div>
      </div>

      <h2>ลูกค้าที่ซื้อมากสุด (Top spenders)</h2>
      {ci.topCustomers.length === 0 ? (
        <p className="muted">ยังไม่มีออเดอร์ที่ชำระแล้ว</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>ออเดอร์</th>
                <th>ยอดซื้อรวม</th>
              </tr>
            </thead>
            <tbody>
              {ci.topCustomers.map((c) => (
                <tr key={c.id}>
                  <td>{c.name ?? <span className="muted">ไม่ระบุชื่อ</span>}</td>
                  <td>{c.orders}</td>
                  <td>{Number(c.spent).toLocaleString("th-TH")} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>สินค้าขายดี (Best sellers)</h2>
      {sellers.length === 0 ? (
        <p className="muted">ยังไม่มีสินค้าที่ขายได้</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>ขายได้ (ชิ้น)</th>
                <th>ยอดขายรวม</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td>{s.qty.toLocaleString("th-TH")}</td>
                  <td>{Number(s.revenue).toLocaleString("th-TH")} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>ช่วงเวลาที่ลูกค้าทักเข้ามา (Peak hours)</h2>
      {busiest && busiest.count > 0 ? (
        <>
          <p className="muted">
            ลูกค้าทักมากสุดช่วง {String(busiest.hour).padStart(2, "0")}:00–
            {String((busiest.hour + 1) % 24).padStart(2, "0")}:00 น. ·
            ควรเตรียมคนตอบช่วงนี้
          </p>
          <div className="card">
            <div className="peak-chart">
              {hours.map((h) => (
                <div key={h.hour} className="peak-col" title={`${h.hour}:00 · ${h.count} ข้อความ`}>
                  <div
                    className="peak-bar"
                    style={{ height: `${(h.count / maxHour) * 100}%` }}
                  />
                  {h.hour % 3 === 0 ? (
                    <span className="peak-label">{h.hour}</span>
                  ) : (
                    <span className="peak-label">&nbsp;</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="muted">ยังไม่มีข้อความเข้ามากพอจะสรุปช่วงเวลา</p>
      )}

      <h2>วิเคราะห์เชิงลึก (Objection &amp; Lead)</h2>
      {!entitlements.fullAnalytics ? (
        <div className="card">
          <p>📊 Objection breakdown + Lead scoring เป็นฟีเจอร์ของแพ็กเกจ Pro ขึ้นไป</p>
          <Link href={`/dashboard/${slug}`} className="btn-link">
            ไปอัปเกรดแพ็กเกจ
          </Link>
        </div>
      ) : (
        <ProAnalytics db={db} tenantId={tenant.id} />
      )}
    </Shell>
  );
}

async function ProAnalytics({
  db,
  tenantId,
}: {
  db: ReturnType<typeof createDbClient>;
  tenantId: string;
}) {
  const [objections, leadStats] = await Promise.all([
    getObjectionBreakdown(db, tenantId),
    getLeadScoreStats(db, tenantId),
  ]);
  const maxTotal = Math.max(1, ...objections.map((o) => o.total));
  return (
    <>
      <div className="grid">
        <div className="card kpi">
          <div className="label">Leads ทั้งหมด</div>
          <div className="value">{leadStats.count}</div>
        </div>
        <div className="card kpi">
          <div className="label">คะแนนเฉลี่ย</div>
          <div className="value">{leadStats.avgScore}</div>
          <div className="sub">เต็ม 100</div>
        </div>
        <div className="card kpi">
          <div className="label">Lead ร้อนแรง (≥60)</div>
          <div className="value">{leadStats.hot}</div>
        </div>
      </div>
      {objections.length === 0 ? (
        <p className="muted">ยังไม่มีข้อมูลข้อโต้แย้ง</p>
      ) : (
        <div className="card">
          {objections.map((o) => (
            <div key={o.type} style={{ margin: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
                <span>{OBJECTION_LABEL[o.type] ?? o.type}</span>
                <span className="muted">
                  {o.total} ครั้ง · ค้าง {o.open}
                </span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(o.total / maxTotal) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
