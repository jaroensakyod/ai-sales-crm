/** Presentational LINE-style bubble preview, shared by the composer (live state)
 *  and the saved-cards list (from stored fields). Mirrors what customBubble()
 *  renders on LINE so "ตัวอย่างบน LINE" matches the real card. No hooks — safe to
 *  render in a server component. */

type PreviewStyle = "plain" | "promo" | "minimal" | string;

const PRESETS: Record<string, { accent: string; price: string; header: string | null }> = {
  plain: { accent: "#185FA5", price: "#1DB446", header: null },
  promo: { accent: "#D85A30", price: "#D85A30", header: "โปรพิเศษ 🔥" },
  minimal: { accent: "#444444", price: "#444444", header: null },
};

export function CardPreview({
  style = "plain",
  headline,
  body,
  priceLabel,
  imageUrl,
  buttonLabels = [],
  accentColor,
}: {
  style?: PreviewStyle;
  headline?: string | null;
  body?: string | null;
  priceLabel?: string | null;
  imageUrl?: string | null;
  buttonLabels?: string[];
  /** Optional custom accent (hex) overriding the preset's accent/price. */
  accentColor?: string | null;
}) {
  const preset = PRESETS[style] ?? PRESETS.plain;
  const accent = accentColor || preset.accent;
  const price = accentColor || preset.price;
  const header = preset.header;
  const labels = buttonLabels.filter((l) => l.trim());

  return (
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
      {header ? (
        <div
          style={{
            background: accent,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 16px",
          }}
        >
          {header}
        </div>
      ) : null}
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          style={{ width: "100%", aspectRatio: "20 / 13", objectFit: "cover", display: "block" }}
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
        {body ? <div style={{ fontSize: 13, color: "#666", marginTop: 6, whiteSpace: "pre-wrap" }}>{body}</div> : null}
        {priceLabel ? (
          <div style={{ fontSize: 15, fontWeight: 700, color: price, marginTop: 10 }}>{priceLabel}</div>
        ) : null}
        {labels.map((label, i) => (
          <div
            key={i}
            style={{
              marginTop: i === 0 ? 14 : 8,
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              ...(style === "minimal" || i > 0
                ? { border: `1px solid ${accent}`, color: accent }
                : { background: accent, color: "#fff" }),
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
