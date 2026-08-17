import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  getLeadScoreStats,
  getObjectionBreakdown,
} from "@/db/repositories/analytics";
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

  if (!entitlements.fullAnalytics) {
    return (
      <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
        <h1>วิเคราะห์เชิงลึก</h1>
        <div className="card">
          <p>📊 การวิเคราะห์ Objection breakdown และ Lead scoring เป็นฟีเจอร์ของแพ็กเกจ Pro</p>
          <Link href={`/dashboard/${slug}`} className="btn-link">
            ไปอัปเกรดแพ็กเกจ
          </Link>
        </div>
      </Shell>
    );
  }

  const [objections, leadStats] = await Promise.all([
    getObjectionBreakdown(db, tenant.id),
    getLeadScoreStats(db, tenant.id),
  ]);
  const maxTotal = Math.max(1, ...objections.map((o) => o.total));

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>วิเคราะห์เชิงลึก</h1>

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

        <h2>ข้อโต้แย้งของลูกค้า (Objection Breakdown)</h2>
        {objections.length === 0 ? (
          <p className="muted">ยังไม่มีข้อมูลข้อโต้แย้ง</p>
        ) : (
          <div className="card">
            {objections.map((o) => (
              <div key={o.type} style={{ margin: "10px 0" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.9rem",
                  }}
                >
                  <span>{OBJECTION_LABEL[o.type] ?? o.type}</span>
                  <span className="muted">
                    {o.total} ครั้ง · ค้าง {o.open}
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(o.total / maxTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
    </Shell>
  );
}
