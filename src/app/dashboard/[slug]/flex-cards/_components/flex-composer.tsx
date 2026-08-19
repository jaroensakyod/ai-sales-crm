"use client";

import { useState, useTransition } from "react";

import { saveFlexCardAction, suggestCaptionsAction } from "../../../actions";

type ProductLite = {
  name: string;
  price: number;
  description: string;
  imageUrl: string;
};

const STYLES: { key: string; label: string; accent: string; price: string; header: string | null }[] = [
  { key: "plain", label: "เรียบ (Plain)", accent: "#185FA5", price: "#1DB446", header: null },
  { key: "promo", label: "โปรโมชั่น (สีส้ม)", accent: "#D85A30", price: "#D85A30", header: "โปรพิเศษ 🔥" },
  { key: "minimal", label: "มินิมอล", accent: "#444444", price: "#444444", header: null },
];

/** Composer for a merchant-designed Flex card with a live LINE-style preview.
 *  The preview mirrors the bubble that buildFlexMessage() produces on LINE. */
export function FlexComposer({
  slug,
  products,
}: {
  slug: string;
  products: ProductLite[];
}) {
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttons, setButtons] = useState<
    { label: string; kind: string; value: string }[]
  >([{ label: "สั่งซื้อเลย", kind: "message", value: "" }]);
  const [style, setStyle] = useState("plain");
  const [captions, setCaptions] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const theme = STYLES.find((s) => s.key === style) ?? STYLES[0];

  function fillFromProduct(p: ProductLite) {
    setName(`การ์ด ${p.name}`);
    setHeadline(p.name);
    setBody(p.description);
    setPriceLabel(p.price ? `เพียง ${p.price.toLocaleString("th-TH")} บาท` : "");
    setImageUrl(p.imageUrl);
    setButtons([
      { label: "สั่งซื้อเลย", kind: "message", value: `สั่งซื้อ ${p.name}` },
      { label: "รายละเอียด", kind: "message", value: `รายละเอียด ${p.name}` },
    ]);
  }

  function updateButton(i: number, patch: Partial<{ label: string; kind: string; value: string }>) {
    setButtons((cur) => cur.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }
  function addButton() {
    if (buttons.length >= 3) return;
    setButtons((cur) => [...cur, { label: "", kind: "message", value: "" }]);
  }
  function removeButton(i: number) {
    setButtons((cur) => cur.filter((_, j) => j !== i));
  }

  function askAiCaptions() {
    if (!headline.trim()) return;
    startTransition(async () => {
      const res = await suggestCaptionsAction(slug, { headline, description: body });
      setCaptions(res);
    });
  }

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
      <form
        action={saveFlexCardAction}
        className="card"
        style={{ flex: "1 1 320px", minWidth: 300 }}
      >
        <input type="hidden" name="slug" value={slug} />
        {products.length > 0 ? (
          <label>
            สร้างจากสินค้า (เติมข้อมูลให้อัตโนมัติ)
            <select
              defaultValue=""
              onChange={(e) => {
                const p = products[Number(e.target.value)];
                if (p) fillFromProduct(p);
              }}
            >
              <option value="" disabled>
                — เลือกสินค้าเพื่อเริ่มเลย —
              </option>
              {products.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                  {p.price ? ` (${p.price.toLocaleString("th-TH")} บาท)` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          รูปแบบการ์ด (สไตล์)
          <select name="style" value={style} onChange={(e) => setStyle(e.target.value)}>
            {STYLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ชื่อการ์ด (สำหรับจัดการภายใน)
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น โปรเดือนนี้"
          />
        </label>
        <label>
          หัวข้อ (headline)
          <input
            name="headline"
            required
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="เช่น ลด 20% เฉพาะเดือนนี้"
          />
        </label>
        <label>
          <span className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            รายละเอียด
            <button
              type="button"
              className="sm"
              onClick={askAiCaptions}
              disabled={pending || !headline.trim()}
              style={{ fontWeight: 400 }}
            >
              {pending ? "กำลังคิด…" : "✨ ให้ AI เขียนแคปชั่น"}
            </button>
          </span>
          <textarea
            name="body"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="เช่น อีบุ๊กดูดวงเฉพาะบุคคล ส่งไฟล์ทันที"
          />
        </label>
        {captions.length > 0 ? (
          <div style={{ marginTop: -4, marginBottom: 8 }}>
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              แตะเพื่อใช้แคปชั่นนี้:
            </span>
            <div className="stack-sm" style={{ marginTop: 6 }}>
              {captions.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBody(c)}
                  style={{
                    textAlign: "left",
                    fontWeight: 400,
                    fontSize: "0.85rem",
                    whiteSpace: "normal",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label>
          ข้อความราคา (ไม่บังคับ)
          <input
            name="priceLabel"
            value={priceLabel}
            onChange={(e) => setPriceLabel(e.target.value)}
            placeholder="เช่น เพียง 1,790 บาท"
          />
        </label>
        <label>
          ลิงก์รูป (URL — https + JPG/PNG)
          <input
            name="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            แนะนำรูป <strong>อัตราส่วน 20:13</strong> เช่น <strong>1024 × 666 px</strong>{" "}
            (แนวนอน) — รูปจะถูกครอปให้พอดีอัตโนมัติ ถ้าใช้ขนาดอื่นอาจโดนตัดขอบ
          </span>
        </label>

        <input type="hidden" name="buttons" value={JSON.stringify(buttons)} />
        <div style={{ marginTop: 4 }}>
          <span style={{ fontWeight: 500, fontSize: "0.9rem" }}>ปุ่มในการ์ด (สูงสุด 3)</span>
          <div className="stack-sm" style={{ marginTop: 6 }}>
            {buttons.map((b, i) => (
              <div
                key={i}
                style={{ border: "0.5px solid #e5e7eb", borderRadius: 8, padding: 8 }}
              >
                <div className="row" style={{ gap: 8 }}>
                  <label style={{ flex: 2, margin: 0 }}>
                    ข้อความบนปุ่ม
                    <input
                      value={b.label}
                      onChange={(e) => updateButton(i, { label: e.target.value })}
                      placeholder="เช่น สั่งซื้อเลย"
                    />
                  </label>
                  <label style={{ flex: 1, margin: 0 }}>
                    ทำอะไร
                    <select
                      value={b.kind}
                      onChange={(e) => updateButton(i, { kind: e.target.value })}
                    >
                      <option value="message">ส่งข้อความ</option>
                      <option value="url">เปิดลิงก์</option>
                    </select>
                  </label>
                </div>
                <label style={{ margin: "6px 0 0" }}>
                  {b.kind === "url" ? "ลิงก์ปลายทาง (URL)" : "ข้อความที่ปุ่มจะส่ง"}
                  <input
                    value={b.value}
                    onChange={(e) => updateButton(i, { value: e.target.value })}
                    placeholder={b.kind === "url" ? "https://..." : "เช่น สั่งซื้ออีบุ๊ก"}
                  />
                </label>
                {buttons.length > 1 ? (
                  <button
                    type="button"
                    className="danger sm"
                    style={{ marginTop: 6 }}
                    onClick={() => removeButton(i)}
                  >
                    ลบปุ่มนี้
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {buttons.length < 3 ? (
            <button type="button" className="sm" style={{ marginTop: 8 }} onClick={addButton}>
              + เพิ่มปุ่ม
            </button>
          ) : null}
        </div>
        <label>
          คำที่ให้บอทส่งการ์ดนี้อัตโนมัติ (trigger — เว้นว่างได้)
          <input
            name="triggerKeyword"
            placeholder="เช่น โปรโมชั่น, ดูสินค้า"
          />
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            ลูกค้าพิมพ์คำนี้ในแชท (LINE/FB) บอทจะส่งการ์ดนี้ให้ทันที
          </span>
        </label>
        <button type="submit" style={{ marginTop: 12 }}>
          บันทึกการ์ด
        </button>
      </form>

      <div style={{ flex: "1 1 260px", minWidth: 240 }}>
        <p className="muted" style={{ marginBottom: 8 }}>
          ตัวอย่างบน LINE
        </p>
        <div
          style={{
            maxWidth: 300,
            background: "#fff",
            border: "1px solid #e2e2e2",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          {theme.header ? (
            <div
              style={{
                background: theme.accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 16px",
              }}
            >
              {theme.header}
            </div>
          ) : null}
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              // Match LINE's hero: 20:13 ratio, cover — so the preview crops
              // exactly like the real card.
              style={{
                width: "100%",
                aspectRatio: "20 / 13",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "20 / 13",
                background: "#f0f0f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#aaa",
                fontSize: 13,
              }}
            >
              รูป 20:13 (เช่น 1024×666)
            </div>
          )}
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>
              {headline || "หัวข้อการ์ด"}
            </div>
            {body ? (
              <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>{body}</div>
            ) : null}
            {priceLabel ? (
              <div style={{ fontSize: 15, fontWeight: 700, color: theme.price, marginTop: 10 }}>
                {priceLabel}
              </div>
            ) : null}
            {buttons
              .filter((b) => b.label.trim())
              .map((b, i) => (
                <div
                  key={i}
                  style={{
                    marginTop: i === 0 ? 14 : 8,
                    textAlign: "center",
                    padding: "9px",
                    borderRadius: 8,
                    ...(style === "minimal" || i > 0
                      ? { border: `1px solid ${theme.accent}`, color: theme.accent }
                      : { background: theme.accent, color: "#fff" }),
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {b.label}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
