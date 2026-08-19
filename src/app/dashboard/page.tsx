import Link from "next/link";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listOwnerTenants } from "@/db/repositories/owners";
import { isAdmin } from "@/features/admin/auth";
import { getOwnerSession } from "@/features/auth/owner";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  // Must be signed in — an owner only ever sees their OWN stores (never a global
  // list of every merchant's store, which the old fallback leaked).
  const owner = await getOwnerSession();
  if (!owner) {
    // A platform super-admin manages stores from /admin, not this owner list.
    if (await isAdmin()) redirect("/admin");
    redirect("/login");
  }
  const db = createDbClient();
  const rows = await listOwnerTenants(db, owner.ownerId);

  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/">🛍️ AI Sales CRM</Link>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
          {owner ? (
            <>
              <span className="muted">สวัสดี {owner.name}</span>
              <a href="/api/auth/logout" className="btn-link">
                ออกจากระบบ
              </a>
            </>
          ) : null}
          <Link href="/dashboard/new" className="btn-link">
            + เปิดร้านใหม่
          </Link>
        </span>
      </div>
      <div className="container">
        <p className="muted" style={{ marginTop: 0 }}>
          <Link href="/">← หน้าแรก</Link>
        </p>
        <h1>ร้านค้าทั้งหมด</h1>
        <p className="muted">เลือกร้านเพื่อเข้าไปจัดการแดชบอร์ด</p>
        {rows.length === 0 ? (
          <p className="muted">
            ยังไม่มีร้าน — กด “เปิดร้านใหม่” เพื่อเริ่มต้นใช้งานได้เลย
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
