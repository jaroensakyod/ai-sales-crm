import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getProduct, suggestCrossSells } from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import { editProductAction } from "../../../actions";
import { Shell } from "../../_components/shell";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const product = await getProduct(db, tenant.id, productId);
  if (!product) notFound();
  const crossSells = await suggestCrossSells(db, tenant.id, productId);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <p className="muted" style={{ marginBottom: 4 }}>
        <Link href={`/dashboard/${slug}/products`}>← กลับหน้าสินค้า</Link>
      </p>
      <h1>แก้ไขสินค้า</h1>
      <p className="muted">
        ข้อมูลตรงนี้คือสิ่งที่ AI ใช้ตอบลูกค้า (ราคา สต็อก และรายละเอียด)
      </p>

      <form action={editProductAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="productId" value={product.id} />
        <label>
          ชื่อสินค้า
          <input name="name" defaultValue={product.name} required />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            ราคา (฿)
            <input
              name="price"
              type="number"
              step="0.01"
              defaultValue={Number(product.price)}
              required
            />
          </label>
          <label style={{ flex: 1 }}>
            สต็อก (เว้นว่าง = ไม่จำกัด)
            <input
              name="stock"
              type="number"
              defaultValue={product.stock ?? ""}
            />
          </label>
          <label style={{ flex: 1 }}>
            SKU
            <input name="sku" defaultValue={product.sku ?? ""} />
          </label>
        </div>
        <label>
          รายละเอียดสินค้า (AI ใช้แนะนำลูกค้า — ใส่จุดเด่น วิธีใช้ ฯลฯ)
          <textarea
            name="description"
            rows={4}
            defaultValue={product.description ?? ""}
            placeholder="เช่น ลิปเนื้อแมตต์ ติดทน 8 ชม. ไม่ตกร่อง เหมาะกับผิวทุกโทน"
          />
        </label>
        <label className="inline">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={product.isActive}
          />
          เปิดขายอยู่
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          บันทึก
        </button>
      </form>

      <h2>สินค้าที่ AI แนะนำคู่ (Cross-sell)</h2>
      {crossSells.length === 0 ? (
        <p className="muted">ยังไม่มีสินค้าแนะนำคู่</p>
      ) : (
        <ul>
          {crossSells.map((c) => (
            <li key={c.productId}>
              {c.name} {c.reason ? <span className="muted">— {c.reason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
