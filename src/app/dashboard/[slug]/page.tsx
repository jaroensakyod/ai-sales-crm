import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  getTenantOverview,
  listRecentConversations,
  listRecentOrders,
} from "@/db/repositories/analytics";
import { getTenantBySlug } from "@/db/repositories/tenants";

export const dynamic = "force-dynamic";

function baht(n: number) {
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}
function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "-";
}
function statusClass(s: string) {
  if (s === "PAID" || s === "CLOSED") return "paid";
  if (s === "HANDOFF") return "handoff";
  if (s === "PENDING_PAYMENT") return "pending";
  return "open";
}

export default async function TenantOverview({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const [overview, conversations, orders] = await Promise.all([
    getTenantOverview(db, tenant.id),
    listRecentConversations(db, tenant.id, 10),
    listRecentOrders(db, tenant.id, 10),
  ]);

  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/dashboard">AI Sales CRM</Link> / {tenant.name}
        </span>
      </div>
      <div className="container">
        <h1>ภาพรวม</h1>

        <div className="grid">
          <div className="card kpi">
            <div className="label">บทสนทนา</div>
            <div className="value">{overview.conversations.total}</div>
            <div className="sub">
              เปิด {overview.conversations.open} · ส่งต่อคน{" "}
              {overview.conversations.handoff}
            </div>
          </div>
          <div className="card kpi">
            <div className="label">ออเดอร์ที่จ่ายแล้ว</div>
            <div className="value">{overview.orders.paid}</div>
            <div className="sub">รอชำระ {overview.orders.pending}</div>
          </div>
          <div className="card kpi">
            <div className="label">ยอดขาย</div>
            <div className="value">{baht(overview.orders.revenue)}</div>
            <div className="sub">จากออเดอร์ที่จ่ายแล้ว</div>
          </div>
          <div className="card kpi">
            <div className="label">Leads</div>
            <div className="value">{overview.leads.total}</div>
          </div>
          <div className="card kpi">
            <div className="label">AI calls</div>
            <div className="value">{overview.ai.calls}</div>
            <div className="sub">
              L1 rule · L2 {overview.ai.byLevel[2] ?? 0} · L3{" "}
              {overview.ai.byLevel[3] ?? 0}
            </div>
          </div>
          <div className="card kpi">
            <div className="label">ต้นทุน AI</div>
            <div className="value">${overview.ai.costUsd.toFixed(4)}</div>
            <div className="sub">สะสมทั้งหมด</div>
          </div>
        </div>

        <h2>บทสนทนาล่าสุด</h2>
        {conversations.length === 0 ? (
          <p className="muted">ยังไม่มีบทสนทนา</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>ลูกค้าทักล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/dashboard/${slug}/inbox/${c.id}`}>
                      {c.customerName ?? "(ไม่ระบุชื่อ)"}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${statusClass(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{when(c.lastInboundAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>ออเดอร์ล่าสุด</h2>
        {orders.length === 0 ? (
          <p className="muted">ยังไม่มีออเดอร์</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>ยอดรวม</th>
                <th>เมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.customerName ?? "-"}</td>
                  <td>
                    <span className={`badge ${statusClass(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>{baht(Number(o.total))}</td>
                  <td>{when(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
