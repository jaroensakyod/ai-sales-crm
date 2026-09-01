import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listFlexCards } from "@/db/repositories/flexCards";
import { listProducts } from "@/db/repositories/products";
import { listQuickReplies } from "@/db/repositories/quickReplies";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import {
  createQuickReplyAction,
  deleteQuickReplyAction,
  editQuickReplyAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function QuickRepliesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "edit_sales");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const items = await listQuickReplies(db, tenant.id);
  const products = await listProducts(db, tenant.id);
  const flexCards = await listFlexCards(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>ปุ่มเมนูตอบเร็ว</h1>
      <p className="muted">
        ปุ่มลัดใต้ข้อความบอท (แบบเดียวกับ “คุยกับแอดมิน”) ลูกค้าแตะแล้วได้คำตอบทันที
        ไม่ต้องพิมพ์ — ตั้งได้เองว่าปุ่มชื่ออะไรและตอบว่าอะไร (แสดงทั้ง LINE และ Facebook)
      </p>
      {ok === "saved" ? <p className="ok">บันทึกปุ่มแล้ว</p> : null}
      {ok === "edited" ? <p className="ok">แก้ไขปุ่มแล้ว</p> : null}
      {ok === "deleted" ? <p className="ok">ลบปุ่มแล้ว</p> : null}
      {error === "empty" ? <p className="error">กรุณากรอกทั้งชื่อปุ่มและคำตอบ</p> : null}

      <h2>เพิ่มปุ่มใหม่</h2>
      <form action={createQuickReplyAction} className="card">
        <input type="hidden" name="slug" value={slug} />
        <div className="row">
          <label style={{ flex: 1 }}>
            ชื่อปุ่ม (สูงสุด 20 ตัว)
            <input name="label" required maxLength={20} placeholder="เช่น เวลาทำการ" />
          </label>
          <label style={{ width: 110 }}>
            ลำดับ
            <input name="sortOrder" type="number" defaultValue={items.length} />
          </label>
        </div>
        <label>
          คำตอบเมื่อลูกค้ากดปุ่มนี้ (หรือพิมพ์คำที่ตั้งไว้)
          <textarea
            name="reply"
            rows={3}
            required
            placeholder="เช่น ร้านเปิดทุกวัน 9:00–20:00 น. ค่ะ สั่งซื้อได้ตลอด 24 ชม. ผ่านแชทนี้เลยนะคะ 😊"
          />
        </label>
        <div className="row" style={{ marginTop: 4, gap: 8, flexWrap: "wrap" }}>
          <label style={{ flex: 2, minWidth: 200, margin: 0 }}>
            คำที่ลูกค้าพิมพ์แล้วตอบอัตโนมัติ (ไม่บังคับ · หลายคำคั่นด้วย , )
            <input name="keywords" placeholder="เช่น เวลาเปิด, กี่โมง, เปิดกี่โมง" />
          </label>
          <label style={{ minWidth: 150, margin: 0 }}>
            รูปแบบการจับคำ
            <select name="matchType" defaultValue="exact">
              <option value="exact">พิมพ์ตรงเป๊ะ</option>
              <option value="contains">มีคำนี้ในข้อความ</option>
            </select>
          </label>
        </div>
        <label>
          ผูกกับสินค้า (ไม่บังคับ — แตะปุ่มแล้วบอทส่งการ์ดสินค้านี้ให้ด้วย)
          <select name="productId" defaultValue="">
            <option value="">— ไม่ผูกสินค้า —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          แนบรูป (ไม่บังคับ — URL รูป https JPG/PNG)
          <input name="imageUrl" type="url" placeholder="https://... (แนบรูปส่งพร้อมคำตอบ)" />
        </label>
        <label>
          แนบการ์ด Flex (ไม่บังคับ — เลือกการ์ดที่บันทึกไว้)
          <select name="flexCardId" defaultValue="">
            <option value="">— ไม่แนบการ์ด —</option>
            {flexCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ marginTop: 10 }}>
          เพิ่มปุ่ม
        </button>
      </form>

      <h2 style={{ marginTop: 24 }}>ปุ่มที่มีอยู่</h2>
      {items.length === 0 ? (
        <p className="muted">ยังไม่มีปุ่ม — เพิ่มด้านบนได้เลย</p>
      ) : (
        <div className="stack-sm">
          {items.map((it) => (
            <div key={it.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: "#e6f1fb",
                      color: "#0c447c",
                      borderRadius: 16,
                      padding: "3px 12px",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                    }}
                  >
                    {it.label}
                  </span>
                  <div className="muted" style={{ fontSize: "0.85rem", marginTop: 6, whiteSpace: "pre-wrap" }}>
                    {it.reply}
                  </div>
                </div>
                <form action={deleteQuickReplyAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="id" value={it.id} />
                  <button type="submit" className="danger sm">
                    ลบ
                  </button>
                </form>
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: "0.85rem" }}>✏️ แก้ไข</summary>
                <form action={editQuickReplyAction} style={{ marginTop: 8 }}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="id" value={it.id} />
                  <label>
                    ชื่อปุ่ม
                    <input name="label" defaultValue={it.label} required maxLength={20} />
                  </label>
                  <label>
                    คำตอบ
                    <textarea name="reply" rows={3} required defaultValue={it.reply} />
                  </label>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <label style={{ flex: 2, minWidth: 200, margin: 0 }}>
                      คำที่พิมพ์แล้วตอบอัตโนมัติ (คั่นด้วย ,)
                      <input name="keywords" defaultValue={it.keywords ?? ""} />
                    </label>
                    <label style={{ minWidth: 150, margin: 0 }}>
                      รูปแบบการจับคำ
                      <select name="matchType" defaultValue={it.matchType ?? "exact"}>
                        <option value="exact">พิมพ์ตรงเป๊ะ</option>
                        <option value="contains">มีคำนี้ในข้อความ</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    ผูกกับสินค้า
                    <select name="productId" defaultValue={it.productId ?? ""}>
                      <option value="">— ไม่ผูกสินค้า —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    แนบรูป (URL)
                    <input name="imageUrl" type="url" defaultValue={it.imageUrl ?? ""} />
                  </label>
                  <label>
                    แนบการ์ด Flex
                    <select name="flexCardId" defaultValue={it.flexCardId ?? ""}>
                      <option value="">— ไม่แนบการ์ด —</option>
                      {flexCards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="sm" style={{ marginTop: 6 }}>
                    บันทึกการแก้ไข
                  </button>
                </form>
              </details>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
