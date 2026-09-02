import { describe, expect, it } from "vitest";

import { fbCardAttachment } from "@/features/facebook/client";
import { buildFlexMessage } from "@/features/line/client";
import type { MessageCard } from "@/features/messaging/cards";
import { buildPaymentInstruction } from "@/features/payment/instruction";
import { normalizeImageUrl } from "@/lib/validation";

describe("normalizeImageUrl", () => {
  it("rewrites a Google Drive file/view link to the direct-view form", () => {
    expect(
      normalizeImageUrl("https://drive.google.com/file/d/ABC123_xy/view?usp=sharing"),
    ).toBe("https://drive.google.com/uc?export=view&id=ABC123_xy");
  });

  it("rewrites an open?id link", () => {
    expect(normalizeImageUrl("https://drive.google.com/open?id=ZZ9-9")).toBe(
      "https://drive.google.com/uc?export=view&id=ZZ9-9",
    );
  });

  it("normalizes an already uc link to the export=view form", () => {
    expect(
      normalizeImageUrl("https://drive.google.com/uc?id=Q1w2E3&export=download"),
    ).toBe("https://drive.google.com/uc?export=view&id=Q1w2E3");
  });

  it("leaves a normal https image URL unchanged", () => {
    const url = "https://cdn.example.com/reviews/abc.jpg";
    expect(normalizeImageUrl(url)).toBe(url);
  });
});

describe("buildPaymentInstruction — digital vs physical", () => {
  const settings = {
    shippingNote: "EMS ส่งฟรีทั่วไทย",
    bankName: "KBank",
    bankAccountNo: "123-4-56789-0",
  };

  it("shows shipping note + address request for a physical order", () => {
    const out = buildPaymentInstruction(settings, { total: 1890, hasPhysical: true });
    expect(out).toContain("EMS ส่งฟรีทั่วไทย");
    expect(out).toContain("ที่อยู่");
  });

  it("omits shipping note + address request for an all-digital order", () => {
    const out = buildPaymentInstruction(settings, { total: 1890, hasPhysical: false });
    expect(out).not.toContain("EMS ส่งฟรีทั่วไทย");
    expect(out).not.toContain("ที่อยู่");
    // still shows the amount + bank so the customer can pay
    expect(out).toContain("1,890");
    expect(out).toContain("123-4-56789-0");
  });

  it("defaults to physical behaviour when hasPhysical is omitted (backward compat)", () => {
    const out = buildPaymentInstruction(settings, { total: 500 });
    expect(out).toContain("EMS ส่งฟรีทั่วไทย");
  });
});

describe("Facebook card — buttonless elements", () => {
  it("omits the empty `buttons` field so Messenger doesn't reject the card", () => {
    // A review carousel: bubbles with no actions.
    const card: MessageCard = {
      kind: "carousel",
      fallback: "รีวิว",
      cards: [
        {
          kind: "custom_flex",
          headline: "รีวิวจาก คุณเอ",
          body: "ดีมาก",
          imageUrl: "https://cdn.example.com/r1.jpg",
          actions: [],
          fallback: "ดีมาก",
        },
      ],
    };
    const att = fbCardAttachment(card) as {
      payload: { elements: { buttons?: unknown }[] };
    };
    const el = att.payload.elements[0];
    expect("buttons" in el).toBe(false);
  });

  it("review card ribbon reads the override text, not the promo default", () => {
    const card: MessageCard = {
      kind: "custom_flex",
      headline: "รีวิวจาก คุณเอ",
      body: "ดีมาก",
      style: "promo",
      headerText: "รวมรีวิว 🔥",
      actions: [],
      fallback: "ดีมาก",
    };
    const flex = buildFlexMessage(card);
    const json = JSON.stringify(flex);
    expect(json).toContain("รวมรีวิว");
    expect(json).not.toContain("โปรพิเศษ");
  });

  it("keeps buttons when actions exist", () => {
    const card: MessageCard = {
      kind: "carousel",
      fallback: "สินค้า",
      cards: [
        {
          kind: "custom_flex",
          headline: "สินค้า A",
          imageUrl: "https://cdn.example.com/a.jpg",
          actions: [{ label: "สั่งซื้อเลย", text: "สั่งซื้อ A" }],
          fallback: "A",
        },
      ],
    };
    const att = fbCardAttachment(card) as {
      payload: { elements: { buttons?: unknown[] }[] };
    };
    expect(att.payload.elements[0].buttons).toHaveLength(1);
  });
});
