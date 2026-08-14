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
        <span className="brand">AI Sales CRM</span>
      </div>
      <div className="container">
        <h1>ร้านค้า</h1>
        {rows.length === 0 ? (
          <p className="muted">
            ยังไม่มีร้าน — รัน <code>npm run db:seed</code> เพื่อสร้างร้านตัวอย่าง
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ชื่อร้าน</th>
                <th>สถานะ</th>
                <th>ประเภท</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/dashboard/${t.slug}`}>{t.name}</Link>
                  </td>
                  <td>{t.status}</td>
                  <td>{t.businessTypes.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
