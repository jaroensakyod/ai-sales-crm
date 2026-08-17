import Link from "next/link";
import { redirect } from "next/navigation";

import { createDbClient } from "@/db/client";
import { adminOverview, PLAN_QUOTA } from "@/db/repositories/admin";
import { isAdmin } from "@/features/admin/auth";

import { adminSetPlanAction } from "./actions";
import "../home.css";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Super Admin — สมาชิก & การใช้งาน" };

const PLAN_KEYS = ["FREE", "STARTER", "PRO"] as const;

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  });
}

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = createDbClient();
  const rows = await adminOverview(db);

  const totalUsed = rows.reduce((s, r) => s + r.used, 0);
  const totalSpend = rows.reduce((s, r) => s + r.spendUsd, 0);
  const paying = rows.filter((r) => r.plan !== "FREE").length;

  return (
    <div className="home admin">
      <nav className="hnav">
        <div className="hnav-in">
          <div className="hbrand">🔐 Super Admin</div>
          <span style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
            <Link href="/dashboard" className="hnav-links" style={{ color: "var(--muted)" }}>
              ไปแดชบอร์ดร้าน
            </Link>
            <a href="/api/admin/login" className="hbtn ghost">ออกจากระบบ</a>
          </span>
        </div>
      </nav>

      <div className="admin-wrap">
        <h1>สมาชิก &amp; การใช้งาน</h1>
        <p className="muted">ร้านทั้งหมดในระบบ · แผน · ข้อความที่ใช้เดือนนี้ / โควตา</p>

        <div className="admin-stats">
          <div className="astat"><div className="ak">ร้านทั้งหมด</div><div className="av">{rows.length}</div></div>
          <div className="astat"><div className="ak">ร้านที่จ่ายเงิน</div><div className="av">{paying}</div></div>
          <div className="astat"><div className="ak">ข้อความรวมเดือนนี้</div><div className="av">{totalUsed.toLocaleString("th-TH")}</div></div>
          <div className="astat"><div className="ak">ต้นทุน AI เดือนนี้</div><div className="av">฿{Math.round(totalSpend * 35).toLocaleString("th-TH")}</div></div>
        </div>

        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ร้าน</th>
                <th>เจ้าของ</th>
                <th>แผน</th>
                <th>ใช้ / โควตา (เดือนนี้)</th>
                <th>เหลือ</th>
                <th>สถานะ</th>
                <th>เปลี่ยนแผน</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const left = Math.max(0, r.quota - r.used);
                const pct = r.quota > 0 ? Math.min(100, Math.round((r.used / r.quota) * 100)) : 0;
                const danger = r.quota > 0 && r.used >= r.quota;
                const warn = r.quota > 0 && r.used >= r.quota * 0.8;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/dashboard/${r.slug}`}><b>{r.name}</b></Link>
                      <div className="sub">/{r.slug} · {fmtDate(r.createdAt)}</div>
                    </td>
                    <td>
                      {r.ownerName ?? <span className="muted">—</span>}
                      {r.ownerProvider ? <div className="sub">{r.ownerProvider}</div> : null}
                    </td>
                    <td>
                      <span className="pill">{PLAN_QUOTA[r.plan]?.label ?? r.plan}</span>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <div className="use-num">
                        {r.used.toLocaleString("th-TH")} / {r.quota.toLocaleString("th-TH")}
                      </div>
                      <div className="bar">
                        <span
                          className={`fill${danger ? " danger" : warn ? " warn" : ""}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className={danger ? "left-danger" : ""}>
                      {left.toLocaleString("th-TH")}
                    </td>
                    <td>
                      <span className={`badge ${r.status === "ACTIVE" ? "paid" : "open"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <form action={adminSetPlanAction} className="plan-form">
                        <input type="hidden" name="tenantId" value={r.id} />
                        <select name="plan" defaultValue={r.plan}>
                          {PLAN_KEYS.map((p) => (
                            <option key={p} value={p}>
                              {PLAN_QUOTA[p].label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="hbtn ghost sm">บันทึก</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
