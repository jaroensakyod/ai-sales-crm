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
  await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const entitlements = await getEntitlements(db, tenant.id);

  const header = (
    <div className="topbar">
      <span className="brand">
        <Link href="/dashboard">AI Sales CRM</Link> /{" "}
        <Link href={`/dashboard/${slug}`}>{tenant.name}</Link> / วิเคราะห์
      </span>
    </div>
  );

  if (!entitlements.fullAnalytics) {
    return (
      <>
        {header}
        <div className="container">
          <h1>วิเคราะห์เชิงลึก</h1>
          <div className="card">
            <p>📊 การวิเคราะห์ Objection breakdown และ Lead scoring เป็นฟีเจอร์ของแพ็กเกจ Pro</p>
            <Link href={`/dashboard/${slug}`} className="btn-link">
              ไปอัปเกรดแพ็กเกจ
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [objections, leadStats] = await Promise.all([
    getObjectionBreakdown(db, tenant.id),
    getLeadScoreStats(db, tenant.id),
  ]);
  const maxTotal = Math.max(1, ...objections.map((o) => o.total));

  return (
    <>
      {header}
      <div className="container">
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
                <div
                  style={{
                    height: 10,
                    background: "#eef2ff",
                    borderRadius: 6,
                    marginTop: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${(o.total / maxTotal) * 100}%`,
                      height: "100%",
                      background: "var(--primary)",
                      borderRadius: 6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
