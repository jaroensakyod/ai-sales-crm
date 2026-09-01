"use client";

import { useState } from "react";

import { saveCarouselCardAction } from "../../../actions";

type ProductLite = {
  name: string;
  price: number;
  description: string;
  imageUrl: string;
};

/** Build a swipeable multi-product carousel by ticking products. Each becomes a
 *  bubble with a "สั่งซื้อ {name}" button (routes into the order flow). */
export function CarouselComposer({
  slug,
  products,
}: {
  slug: string;
  products: ProductLite[];
}) {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("plain");
  const [picked, setPicked] = useState<number[]>([]);

  function toggle(i: number) {
    setPicked((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  }

  const items = picked.map((i) => {
    const p = products[i];
    return {
      headline: p.name,
      body: p.description,
      priceLabel: p.price ? `เพียง ${p.price.toLocaleString("th-TH")} บาท` : "",
      imageUrl: p.imageUrl,
      // Product-specific label (LINE truncates to 20 chars) so every bubble's
      // button reads for its own product — not an identical "สั่งซื้อเลย".
      buttonLabel: `สั่งซื้อ ${p.name}`,
      buttonKind: "message",
      buttonValue: `สั่งซื้อ ${p.name}`,
    };
  });

  if (products.length === 0) {
    return (
      <p className="muted">ยังไม่มีสินค้าในระบบ — เพิ่มสินค้าก่อนถึงจะสร้าง carousel ได้</p>
    );
  }

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
      <form
        action={saveCarouselCardAction}
        className="card"
        style={{ flex: "1 1 320px", minWidth: 300 }}
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="items" value={JSON.stringify(items)} />
        <label>
          ชื่อชุดการ์ด
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น สินค้าขายดี"
          />
        </label>
        <label>
          รูปแบบการ์ด (สไตล์)
          <select name="style" value={style} onChange={(e) => setStyle(e.target.value)}>
            <option value="plain">เรียบ (Plain)</option>
            <option value="promo">โปรโมชั่น (สีส้ม)</option>
            <option value="minimal">มินิมอล</option>
          </select>
        </label>
        <p style={{ margin: "8px 0 4px", fontWeight: 500 }}>
          เลือกสินค้าที่จะใส่ในชุด (สูงสุด 10)
        </p>
        <div className="stack-sm">
          {products.map((p, i) => (
            <label key={i} className="inline">
              <input
                type="checkbox"
                checked={picked.includes(i)}
                onChange={() => toggle(i)}
                disabled={!picked.includes(i) && picked.length >= 10}
              />
              {p.name}
              {p.price ? ` (${p.price.toLocaleString("th-TH")} บาท)` : ""}
            </label>
          ))}
        </div>
        <label>
          คำที่ให้บอทส่งชุดนี้อัตโนมัติ (trigger — เว้นว่างได้)
          <input name="triggerKeyword" placeholder="เช่น สินค้าขายดี, มีอะไรบ้าง" />
        </label>
        <button type="submit" style={{ marginTop: 12 }} disabled={picked.length === 0}>
          บันทึกชุดการ์ด ({picked.length})
        </button>
      </form>

      <div style={{ flex: "1 1 260px", minWidth: 240 }}>
        <p className="muted" style={{ marginBottom: 8 }}>
          ตัวอย่าง (เลื่อนดูได้บน LINE)
        </p>
        {items.length === 0 ? (
          <p className="muted">ยังไม่ได้เลือกสินค้า</p>
        ) : (
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  flex: "0 0 200px",
                  background: "#fff",
                  border: "1px solid #e2e2e2",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt=""
                    style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ height: 80, background: "#f0f0f0" }} />
                )}
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{it.headline}</div>
                  {it.priceLabel ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1DB446", marginTop: 6 }}>
                      {it.priceLabel}
                    </div>
                  ) : null}
                  <div
                    style={{
                      marginTop: 10,
                      textAlign: "center",
                      padding: "7px",
                      borderRadius: 6,
                      background: "#185FA5",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    สั่งซื้อเลย
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
