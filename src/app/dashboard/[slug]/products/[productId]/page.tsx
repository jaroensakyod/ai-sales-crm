import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import {
  getProduct,
  listCrossSells,
  listProducts,
  listVariants,
} from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requireTenantAuth } from "@/features/auth/session";

import {
  addCrossSellAction,
  addVariantAction,
  deleteVariantAction,
  editProductAction,
  removeCrossSellAction,
  uploadProductImageAction,
} from "../../../actions";
import { Shell } from "../../_components/shell";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, productId } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const product = await getProduct(db, tenant.id, productId);
  if (!product) notFound();
  const crossSells = await listCrossSells(db, tenant.id, productId);
  const allProducts = await listProducts(db, tenant.id);
  const others = allProducts.filter((p) => p.id !== productId);
  const variants = await listVariants(db, tenant.id, productId);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
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
          รายละเอียดสั้น ๆ (แสดงบนการ์ด Flex — ควรสั้น กระชับ)
          <textarea
            name="description"
            rows={2}
            defaultValue={product.description ?? ""}
            placeholder="เช่น ลิปเนื้อแมตต์ ติดทน 8 ชม. ไม่ตกร่อง เหมาะกับผิวทุกโทน"
          />
        </label>
        <label>
          คลังความรู้สินค้า (AI อ่านไว้ตอบเชิงลึก — ไม่ขึ้นบนการ์ด ใส่ยาวได้)
          <textarea
            name="aiKnowledge"
            rows={6}
            defaultValue={product.aiKnowledge ?? ""}
            placeholder="ใส่ข้อมูลละเอียด: ส่วนผสม/สเปก วิธีใช้ คำถามที่ลูกค้าถามบ่อย ข้อควรระวัง ฯลฯ — บอทจะดึงตรงนี้ไปตอบ แต่จะไม่ยัดลงการ์ดให้รก"
          />
        </label>
        <label>
          ลิงก์รูปสินค้า (URL — บอทส่งให้ลูกค้าเมื่อขอดูรูป)
          <input
            name="imageUrl"
            type="url"
            defaultValue={product.imageUrl ?? ""}
            placeholder="https://... (https + JPG/PNG)"
          />
        </label>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            style={{ maxWidth: 160, borderRadius: 8, marginTop: 4 }}
          />
        ) : null}
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

      <h2>อัปโหลดรูปสินค้า</h2>
      <p className="muted">
        เลือกไฟล์จากเครื่อง ระบบจะเก็บให้และตั้งเป็นรูปสินค้าอัตโนมัติ —
        บอทส่งรูปนี้ให้ลูกค้าเมื่อถูกขอดูรูป (ไม่ต้องหาลิงก์เอง)
      </p>
      {ok === "image" ? <p className="ok">อัปโหลดรูปเรียบร้อยแล้ว</p> : null}
      {error === "storage" ? (
        <p className="error">
          ยังไม่ได้ตั้งค่าที่เก็บรูป (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) —
          ใช้ช่อง “ลิงก์รูปสินค้า” ด้านบนแทนได้
        </p>
      ) : null}
      {error === "upload" ? (
        <p className="error">อัปโหลดไม่สำเร็จ — ไฟล์ต้องเป็น JPG/PNG/WEBP ขนาดไม่เกิน 5MB</p>
      ) : null}
      {error === "nofile" ? <p className="error">ยังไม่ได้เลือกไฟล์</p> : null}
      <form action={uploadProductImageAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="productId" value={product.id} />
        <label>
          เลือกไฟล์รูป (JPG / PNG / WEBP · ไม่เกิน 5MB)
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          อัปโหลด
        </button>
      </form>

      <h2>ตัวเลือกสินค้า (สี / ไซซ์ / รุ่น)</h2>
      {variants.length === 0 ? (
        <p className="muted">ยังไม่มีตัวเลือก — ใช้ราคา/สต็อกหลักของสินค้า</p>
      ) : (
        <div className="stack-sm" style={{ marginBottom: 14 }}>
          {variants.map((v) => (
            <div key={v.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                🎨 {v.name}
                {v.price != null ? (
                  <span className="muted"> — {Number(v.price).toLocaleString("th-TH")} บาท</span>
                ) : null}
                {v.stock != null ? (
                  <span className="muted"> · คงเหลือ {v.stock}</span>
                ) : null}
              </span>
              <form action={deleteVariantAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="variantId" value={v.id} />
                <button type="submit" className="danger sm">
                  ลบ
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
      <form action={addVariantAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="productId" value={productId} />
        <div className="row">
          <label style={{ flex: 2 }}>
            ชื่อตัวเลือก
            <input name="name" required placeholder="เช่น สีแดง / ไซซ์ L" />
          </label>
          <label style={{ flex: 1 }}>
            ราคา (เว้นว่าง = ใช้ราคาหลัก)
            <input name="price" type="number" step="0.01" />
          </label>
          <label style={{ flex: 1 }}>
            สต็อก
            <input name="stock" type="number" />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 10 }}>
          เพิ่มตัวเลือก
        </button>
      </form>

      <h2>สินค้าที่ AI แนะนำคู่ (Cross-sell)</h2>
      <p className="muted">
        เมื่อลูกค้าถามซื้อสินค้านี้ AI จะเสนอสินค้าคู่ให้อัตโนมัติ
      </p>
      {crossSells.length === 0 ? (
        <p className="muted">ยังไม่มีสินค้าแนะนำคู่</p>
      ) : (
        <div className="stack-sm" style={{ marginBottom: 14 }}>
          {crossSells.map((c) => (
            <div key={c.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                🔗 {c.name}{" "}
                {c.reason ? <span className="muted">— {c.reason}</span> : null}
              </span>
              <form action={removeCrossSellAction}>
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="productId" value={productId} />
                <input type="hidden" name="crossSellId" value={c.id} />
                <button type="submit" className="danger sm">
                  ลบ
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
      {others.length > 0 ? (
        <form action={addCrossSellAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="productId" value={productId} />
          <label>
            เพิ่มสินค้าแนะนำคู่
            <select name="suggestedProductId" required>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            เหตุผล (ไม่บังคับ)
            <input name="reason" placeholder="เช่น โทนสีเข้ากัน แต่งหน้าครบลุค" />
          </label>
          <button type="submit" style={{ marginTop: 10 }}>
            เพิ่มคู่แนะนำ
          </button>
        </form>
      ) : null}
    </Shell>
  );
}
