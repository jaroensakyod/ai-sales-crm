import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listProducts } from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { slug } = await params;
  const { ok } = await searchParams;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const items = await listProducts(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>สินค้า</h1>
      <p className="muted">
        AI จะดึงราคา/สต็อกจากตรงนี้ตอบลูกค้า — แก้แล้วมีผลทันที
      </p>
      {ok ? <p className="ok">บันทึกแล้ว</p> : null}

      {items.length === 0 ? (
        <p className="muted">ยังไม่มีสินค้า — เพิ่มด้านล่างได้เลย</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ชื่อสินค้า</th>
                <th>ราคา (฿)</th>
                <th>สต็อก</th>
                <th>ขายอยู่</th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <form
                      id={`edit-${p.id}`}
                      action={updateProductAction}
                    >
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="productId" value={p.id} />
                      <input name="name" defaultValue={p.name} required />
                    </form>
                  </td>
                  <td>
                    <input
                      form={`edit-${p.id}`}
                      name="price"
                      type="number"
                      step="0.01"
                      defaultValue={Number(p.price)}
                      style={{ width: 100 }}
                    />
                  </td>
                  <td>
                    <input
                      form={`edit-${p.id}`}
                      name="stock"
                      type="number"
                      defaultValue={p.stock ?? ""}
                      placeholder="ไม่จำกัด"
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    <input
                      form={`edit-${p.id}`}
                      name="isActive"
                      type="checkbox"
                      defaultChecked={p.isActive}
                    />
                  </td>
                  <td>
                    <button form={`edit-${p.id}`} type="submit" className="sm">
                      บันทึก
                    </button>
                  </td>
                  <td>
                    <Link
                      href={`/dashboard/${slug}/products/${p.id}`}
                      className="btn sm ghost"
                    >
                      รายละเอียด
                    </Link>
                  </td>
                  <td>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="productId" value={p.id} />
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

      <h2>เพิ่มสินค้าใหม่</h2>
      <form action={createProductAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <label>
          ชื่อสินค้า
          <input name="name" required placeholder="เช่น ลิปสติกสีแดง Matte" />
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <label style={{ flex: 1 }}>
            ราคา (฿)
            <input name="price" type="number" step="0.01" required placeholder="390" />
          </label>
          <label style={{ flex: 1 }}>
            สต็อก (เว้นว่าง = ไม่จำกัด)
            <input name="stock" type="number" placeholder="50" />
          </label>
          <label style={{ flex: 1 }}>
            SKU (ถ้ามี)
            <input name="sku" placeholder="LIP-001" />
          </label>
        </div>
        <label>
          รายละเอียด
          <textarea name="description" rows={2} placeholder="รายละเอียดสินค้า สำหรับให้ AI แนะนำ" />
        </label>
        <label>
          ลิงก์รูปสินค้า (URL)
          <input
            name="imageUrl"
            type="url"
            placeholder="https://... (ต้องเป็น https และเป็น JPG/PNG)"
          />
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            บอทจะส่งรูปนี้ให้ลูกค้าเมื่อถูกขอดูรูป — ใช้ลิงก์รูปสาธารณะ (เช่นจากเว็บร้าน/Google Drive แบบแชร์)
          </span>
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          เพิ่มสินค้า
        </button>
      </form>
    </Shell>
  );
}
