import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { listFlexCards } from "@/db/repositories/flexCards";
import { listProducts } from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import {
  broadcastFlexCardAction,
  deleteFlexCardAction,
  updateFlexCardTriggerAction,
} from "../../actions";
import { Shell } from "../_components/shell";
import { CarouselComposer } from "./_components/carousel-composer";
import { FlexComposer } from "./_components/flex-composer";

export const dynamic = "force-dynamic";

const OK_MSG: Record<string, string> = {
  saved: "บันทึกการ์ดเรียบร้อยแล้ว",
  deleted: "ลบการ์ดแล้ว",
  broadcast: "ส่งบรอดแคสต์การ์ดให้เพื่อน LINE แล้ว",
  trigger: "ตั้งคำ trigger เรียบร้อยแล้ว — ลูกค้าพิมพ์คำนี้แล้วบอทจะส่งการ์ดให้",
};
const ERR_MSG: Record<string, string> = {
  empty: "กรุณากรอกชื่อการ์ดและหัวข้อ",
  carousel: "กรุณาตั้งชื่อชุดและเลือกสินค้าอย่างน้อย 1 อย่าง",
  plan: "การบรอดแคสต์ต้องอัปเกรดแพ็กเกจก่อน",
  confirm: "กรุณาติ๊กยืนยันก่อนส่งบรอดแคสต์",
  nochannel: "ยังไม่ได้เชื่อม LINE OA",
  notfound: "ไม่พบการ์ด",
  send: "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง",
};

export default async function FlexCardsPage({
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

  const cards = await listFlexCards(db, tenant.id);
  const canBroadcast = (await getEntitlements(db, tenant.id)).promoBroadcast;
  // Products feed the "สร้างจากสินค้า" quick-fill in the composer.
  const products = (await listProducts(db, tenant.id))
    .filter((p) => p.isActive)
    .map((p) => ({
      name: p.name,
      price: Number(p.price),
      description: p.description ?? "",
      imageUrl: p.imageUrl ?? "",
    }));

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <h1>การ์ด Flex</h1>
      <p className="muted">
        ออกแบบการ์ดสวย ๆ (รูป + หัวข้อ + ราคา + ปุ่ม) ให้บอทส่งในแชท หรือบรอดแคสต์หา
        เพื่อน LINE ทั้งหมด — การ์ดเดียวใช้ได้ทั้ง LINE และ Facebook
      </p>
      {ok && OK_MSG[ok] ? <p className="ok">{OK_MSG[ok]}</p> : null}
      {error && ERR_MSG[error] ? <p className="error">{ERR_MSG[error]}</p> : null}

      <h2>สร้างการ์ดเดี่ยว</h2>
      <FlexComposer slug={slug} products={products} />

      <h2 style={{ marginTop: 24 }}>สร้างชุดการ์ดหลายสินค้า (Carousel)</h2>
      <p className="muted">เลือกหลายสินค้า ลูกค้าเลื่อนดูเป็นการ์ด ๆ ในแชทได้</p>
      <CarouselComposer slug={slug} products={products} />

      <h2 style={{ marginTop: 24 }}>การ์ดที่บันทึกไว้</h2>
      {cards.length === 0 ? (
        <p className="muted">ยังไม่มีการ์ด — สร้างด้านบนได้เลย</p>
      ) : (
        <div className="stack-sm">
          {cards.map((c) => (
            <div key={c.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <strong>{c.name}</strong>
                  {c.style && c.style !== "plain" ? (
                    <span className="muted" style={{ fontSize: "0.75rem" }}>
                      {" "}
                      · สไตล์ {c.style}
                    </span>
                  ) : null}
                  <div className="muted" style={{ fontSize: "0.85rem" }}>
                    {c.kind === "carousel"
                      ? `ชุดการ์ด ${(c.items ?? []).length} สินค้า`
                      : `${c.headline ?? ""}${c.priceLabel ? ` · ${c.priceLabel}` : ""}`}
                    {c.triggerKeyword ? ` · 🔑 “${c.triggerKeyword}”` : ""}
                  </div>
                </div>
                <form action={deleteFlexCardAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="cardId" value={c.id} />
                  <button type="submit" className="danger sm">
                    ลบ
                  </button>
                </form>
              </div>

              <form
                action={updateFlexCardTriggerAction}
                className="row"
                style={{ marginTop: 10, gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
              >
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="cardId" value={c.id} />
                <label style={{ flex: 1, minWidth: 180, margin: 0 }}>
                  คำที่ให้บอทส่งการ์ดนี้อัตโนมัติ (ใส่ได้หลายคำ คั่นด้วย , หรือขึ้นบรรทัดใหม่)
                  <input
                    name="triggerKeyword"
                    defaultValue={c.triggerKeyword ?? ""}
                    placeholder="เช่น โปรโมชั่น, โปร, ส่วนลด"
                  />
                </label>
                <label style={{ minWidth: 140, margin: 0 }}>
                  รูปแบบการจับคำ
                  <select name="triggerMatch" defaultValue={c.triggerMatch ?? "contains"}>
                    <option value="contains">มีคำนี้ในข้อความ</option>
                    <option value="exact">พิมพ์ตรงเป๊ะทั้งข้อความ</option>
                  </select>
                </label>
                <button type="submit" className="sm">
                  บันทึกคำ
                </button>
              </form>

              {canBroadcast ? (
                <form
                  action={broadcastFlexCardAction}
                  style={{ marginTop: 10, borderTop: "0.5px solid #eee", paddingTop: 10 }}
                >
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="cardId" value={c.id} />
                  <label className="inline">
                    <input type="checkbox" name="confirm" />
                    ยืนยันส่งการ์ดนี้บรอดแคสต์หาเพื่อน LINE ทั้งหมด (นับโควตาตามจำนวนเพื่อน)
                  </label>
                  <button type="submit" style={{ marginTop: 8 }}>
                    บรอดแคสต์การ์ดนี้
                  </button>
                </form>
              ) : (
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>
                  * การบรอดแคสต์ต้องอัปเกรดแพ็กเกจ
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
