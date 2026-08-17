import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listPromotions } from "@/db/repositories/promotions";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import {
  createPromotionAction,
  deletePromotionAction,
  togglePromotionAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function PromotionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const promos = await listPromotions(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>โปรโมชั่น</h1>
      <p className="muted">
        โปรที่เปิดอยู่ AI จะเสนอให้ลูกค้าเองในแชท
      </p>

      {promos.length === 0 ? (
        <p className="muted">ยังไม่มีโปรโมชั่น — เพิ่มด้านล่าง</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>โค้ด</th>
                <th>ส่วนลด</th>
                <th>สถานะ</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td>{p.code ?? <span className="muted">(ไม่มีโค้ด)</span>}</td>
                  <td>
                    {p.type === "PERCENT"
                      ? `${Number(p.value)}%`
                      : `${Number(p.value).toLocaleString("th-TH")} บาท`}
                  </td>
                  <td>
                    <span className={`badge ${p.isActive ? "paid" : "handoff"}`}>
                      {p.isActive ? "เปิด" : "ปิด"}
                    </span>
                  </td>
                  <td>
                    <form action={togglePromotionAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="promotionId" value={p.id} />
                      <button type="submit" className="sm ghost">
                        {p.isActive ? "ปิด" : "เปิด"}
                      </button>
                    </form>
                  </td>
                  <td>
                    <form action={deletePromotionAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="promotionId" value={p.id} />
                      <button type="submit" className="danger sm">
                        ลบ
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>เพิ่มโปรโมชั่น</h2>
      <form action={createPromotionAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          โค้ด (ไม่บังคับ)
          <input name="code" placeholder="เช่น SALE10" />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            ประเภท
            <select name="type" defaultValue="PERCENT">
              <option value="PERCENT">ลดเป็น %</option>
              <option value="FIXED">ลดเป็นบาท</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            มูลค่า
            <input name="value" type="number" step="0.01" required placeholder="10" />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มโปรโมชั่น
        </button>
      </form>
    </Shell>
  );
}
