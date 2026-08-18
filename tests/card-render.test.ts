import { describe, expect, it } from "vitest";

import { buildFlexMessage } from "@/features/line/client";
import { fbCardAttachment } from "@/features/facebook/client";
import type { MessageCard } from "@/features/messaging/cards";

const ORDER: MessageCard = {
  kind: "order_confirm",
  title: "ยืนยันคำสั่งซื้อ",
  productName: "อีบุ๊กดูดวง (PDF)",
  imageUrl: "https://example.com/ebook.jpg",
  detail: "จำนวน 1 • รวม 1,790 บาท",
  actions: [
    { label: "✅ ยืนยันสั่งซื้อ", text: "ยืนยันสั่งซื้อ" },
    { label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" },
  ],
  fallback: "รับ อีบุ๊กดูดวง (PDF) จำนวน 1 รวม 1,790 บาทค่ะ",
};

const PAYMENT: MessageCard = {
  kind: "payment",
  title: "ช่องทางชำระเงิน 💳",
  amountLabel: "ยอดชำระ 1,790 บาท",
  rows: [
    { label: "กสิกร", value: "200-8-20487-2" },
    { label: "ชื่อบัญชี", value: "บจก. มูเทค" },
  ],
  note: "โอนแล้วส่งสลิปได้เลยค่ะ",
  actions: [{ label: "คุยกับแอดมิน", text: "คุยกับแอดมิน" }],
  fallback: "ยอดชำระ 1,790 บาท กสิกร 200-8-20487-2",
};

describe("LINE Flex rendering", () => {
  it("renders an order card with hero image and a confirm button that routes", () => {
    const msg = buildFlexMessage(ORDER);
    expect(msg.type).toBe("flex");
    expect(msg.altText).toContain("อีบุ๊กดูดวง");
    const bubble = msg.contents as Record<string, unknown>;
    expect((bubble.hero as { url: string }).url).toBe("https://example.com/ebook.jpg");
    // The confirm button must send exactly "ยืนยันสั่งซื้อ" (so tryConfirmOrder fires).
    const footer = bubble.footer as { contents: { action: { text: string } }[] };
    expect(footer.contents[0].action.text).toBe("ยืนยันสั่งซื้อ");
  });

  it("omits the hero when there's no image", () => {
    const msg = buildFlexMessage({ ...ORDER, imageUrl: null });
    const bubble = msg.contents as Record<string, unknown>;
    expect(bubble.hero).toBeUndefined();
  });

  it("renders a payment card with account rows", () => {
    const msg = buildFlexMessage(PAYMENT);
    expect(JSON.stringify(msg)).toContain("200-8-20487-2");
  });
});

describe("Facebook template rendering", () => {
  it("uses a generic template with the image + a postback confirm button", () => {
    const att = fbCardAttachment(ORDER) as {
      payload: {
        template_type: string;
        elements: { image_url: string; buttons: { payload: string }[] }[];
      };
    };
    expect(att.payload.template_type).toBe("generic");
    expect(att.payload.elements[0].image_url).toBe("https://example.com/ebook.jpg");
    expect(att.payload.elements[0].buttons[0].payload).toBe("ยืนยันสั่งซื้อ");
  });

  it("falls back to a button template when the order has no image", () => {
    const att = fbCardAttachment({ ...ORDER, imageUrl: null }) as {
      payload: { template_type: string; text: string };
    };
    expect(att.payload.template_type).toBe("button");
    expect(att.payload.text).toContain("อีบุ๊กดูดวง");
  });

  it("puts the full payment instruction in a button template", () => {
    const att = fbCardAttachment(PAYMENT) as {
      payload: { template_type: string; text: string };
    };
    expect(att.payload.template_type).toBe("button");
    expect(att.payload.text).toContain("200-8-20487-2");
  });
});

describe("custom (merchant-designed) Flex card", () => {
  const PROMO: MessageCard = {
    kind: "custom_flex",
    imageUrl: "https://example.com/promo.jpg",
    headline: "ลด 20% เฉพาะเดือนนี้",
    body: "อีบุ๊กดูดวงเฉพาะบุคคล",
    priceLabel: "เพียง 1,790 บาท",
    actions: [{ label: "สั่งซื้อเลย", url: "https://shop.example.com" }],
    fallback: "ลด 20% เฉพาะเดือนนี้ เพียง 1,790 บาท",
  };

  it("LINE renders a bubble with the headline, price, and a URI button", () => {
    const msg = buildFlexMessage(PROMO);
    const json = JSON.stringify(msg);
    expect(json).toContain("ลด 20%");
    expect(json).toContain("1,790");
    // URL action becomes a LINE "uri" action, not "message".
    const footer = (msg.contents as { footer: { contents: { action: { type: string; uri?: string } }[] } }).footer;
    expect(footer.contents[0].action.type).toBe("uri");
    expect(footer.contents[0].action.uri).toBe("https://shop.example.com");
  });

  it("Facebook renders a generic template with a web_url button", () => {
    const att = fbCardAttachment(PROMO) as {
      payload: { template_type: string; elements: { buttons: { type: string; url?: string }[] }[] };
    };
    expect(att.payload.template_type).toBe("generic");
    expect(att.payload.elements[0].buttons[0].type).toBe("web_url");
    expect(att.payload.elements[0].buttons[0].url).toBe("https://shop.example.com");
  });

  it("the 'promo' style adds a coloured header ribbon on LINE", () => {
    const msg = buildFlexMessage({ ...(PROMO as object), style: "promo" } as MessageCard);
    const bubble = msg.contents as { header?: { backgroundColor: string } };
    expect(bubble.header).toBeTruthy();
    expect(bubble.header?.backgroundColor).toBe("#D85A30");
  });
});

describe("carousel card (multiple products)", () => {
  const bubble = (headline: string): MessageCard => ({
    kind: "custom_flex",
    headline,
    priceLabel: "1,000 บาท",
    actions: [{ label: "สั่งซื้อ", text: `สั่งซื้อ ${headline}` }],
    fallback: headline,
  });
  const CAROUSEL: MessageCard = {
    kind: "carousel",
    cards: [bubble("สินค้า A"), bubble("สินค้า B"), bubble("สินค้า C")].map(
      (c) => c as Extract<MessageCard, { kind: "custom_flex" }>,
    ),
    fallback: "สินค้า A · สินค้า B · สินค้า C",
  };

  it("LINE renders a carousel container with one bubble per product", () => {
    const msg = buildFlexMessage(CAROUSEL);
    const container = msg.contents as { type: string; contents: unknown[] };
    expect(container.type).toBe("carousel");
    expect(container.contents).toHaveLength(3);
  });

  it("Facebook renders a generic template with multiple elements", () => {
    const att = fbCardAttachment(CAROUSEL) as {
      payload: { template_type: string; elements: { title: string }[] };
    };
    expect(att.payload.template_type).toBe("generic");
    expect(att.payload.elements).toHaveLength(3);
    expect(att.payload.elements[1].title).toBe("สินค้า B");
  });
});
