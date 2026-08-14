import { asc } from "drizzle-orm";
import Link from "next/link";

import { createDbClient } from "@/db/client";
import { tenants } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const db = createDbClient();
  const rows = await db.select().from(tenants).orderBy(asc(tenants.name));

  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/">🛍️ AI Sales CRM</Link>
        </span>
        <Link href="/dashboard/new" className="btn-link">
          + เปิดร้านใหม่
        </Link>
      </div>
      <div className="container">
        <p className="muted" style={{ marginTop: 0 }}>
          <Link href="/">← หน้าแรก</Link>
        </p>
        <h1>ร้านค้าทั้งหมด</h1>
        <p className="muted">เลือกร้านเพื่อเข้าไปจัดการแดชบอร์ด</p>
        {rows.length === 0 ? (
          <p className="muted">
            ยังไม่มีร้าน — กด “เปิดร้านใหม่” หรือรัน <code className="url">npm run db:seed</code>{" "}
            เพื่อสร้างร้านตัวอย่าง
          </p>
        ) : (
          <div className="action-grid">
            {rows.map((t) => (
              <Link key={t.id} href={`/dashboard/${t.slug}`} className="action-card">
                <div className="ac-icon">🏪</div>
                <div className="ac-title">{t.name}</div>
                <div className="ac-desc">
                  <span className={`badge ${t.status === "ACTIVE" ? "paid" : "open"}`}>
                    {t.status}
                  </span>{" "}
                  {t.businessTypes.join(", ")}
                </div>
                <span className="ac-go">เข้าจัดการ →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
