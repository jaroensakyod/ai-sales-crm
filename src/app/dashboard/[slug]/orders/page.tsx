import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listOrders } from "@/db/repositories/orders";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

function baht(n: number) {
  return `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
}
function when(d: Date | null) {
  return d ? new Date(d).toLocaleString("th-TH") : "-";
}
function statusClass(s: string) {
  if (s === "PAID" || s === "FULFILLED") return "paid";
  if (s === "PENDING_PAYMENT") return "pending";
  if (s === "CANCELLED" || s === "REFUNDED") return "handoff";
  return "open";
}

export default async function OrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const orders = await listOrders(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>ออเดอร์</h1>
      {orders.length === 0 ? (
        <p className="muted">ยังไม่มีออเดอร์</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ลูกค้า</th>
                <th>สถานะ</th>
                <th>ยอดรวม</th>
                <th>เมื่อ</th>
                <th></th>
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
                  <td>
                    <Link
                      href={`/dashboard/${slug}/orders/${o.id}`}
                      className="btn sm ghost"
                    >
                      ดู
                    </Link>
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
