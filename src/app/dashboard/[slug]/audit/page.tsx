import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listAuditLogs } from "@/db/repositories/audit";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "";
}

export default async function AuditPage({
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

  const logs = await listAuditLogs(db, tenant.id, 100);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>บันทึกการทำงาน (Audit)</h1>
      <p className="muted">
        บันทึกการเปลี่ยนแปลงสำคัญ — ส่วนลด, สถานะออเดอร์, การยืนยันชำระเงิน,
        สิทธิ์/รหัสผ่านทีม, แพ็กเกจ
      </p>
      {logs.length === 0 ? (
        <p className="muted">ยังไม่มีบันทึก</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>เมื่อ</th>
                <th>การกระทำ</th>
                <th>รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{when(l.createdAt)}</td>
                  <td>{l.action}</td>
                  <td className="muted" style={{ fontSize: "0.82rem" }}>
                    {l.entity ? `${l.entity} ` : ""}
                    {l.data ? JSON.stringify(l.data) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
