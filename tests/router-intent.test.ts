import { describe, expect, it } from "vitest";

import {
  hasPriceIntent,
  hasStockIntent,
  matchHandoff,
  matchProduct,
  matchProductOrVariant,
  productAliases,
  type ProductLike,
} from "@/features/router/intent";

const CATALOG: ProductLike[] = [
  {
    id: "1",
    name: "ลิปสติกสีแดง Matte",
    sku: "LIP-001",
    price: "390",
    stock: 50,
    currency: "THB",
  },
  {
    id: "2",
    name: "บรัชออนสีพีช",
    sku: "BRUSH-01",
    price: "290",
    stock: 0,
    currency: "THB",
  },
];

describe("router intent detection", () => {
  it("detects price intent", () => {
    expect(hasPriceIntent("ลิปสติกราคาเท่าไหร่")).toBe(true);
    expect(hasPriceIntent("how much is this")).toBe(true);
    expect(hasPriceIntent("สวัสดีครับ")).toBe(false);
  });

  it("detects stock intent", () => {
    expect(hasStockIntent("มีของไหมคะ")).toBe(true);
    expect(hasStockIntent("ยังพร้อมส่งอยู่ไหม")).toBe(true);
    expect(hasStockIntent("ขอบคุณค่ะ")).toBe(false);
  });

  it("flags refund/dispute for handoff", () => {
    expect(matchHandoff("ขอคืนเงินหน่อยค่ะ")).toBe("คืนเงิน");
    expect(matchHandoff("I want a refund")).toBe("refund");
    expect(matchHandoff("ราคาเท่าไหร่")).toBeNull();
  });
  it("routes the 'talk to a human' quick-reply chip to handoff", () => {
    expect(matchHandoff("คุยกับแอดมิน")).toBe("คุยกับแอดมิน");
    expect(matchHandoff("ขอคุยกับแอดมินหน่อย")).toBe("คุยกับแอดมิน");
    expect(matchHandoff("talk to a human please")).toBe("talk to a human");
  });
});

describe("product matching", () => {
  it("builds aliases", () => {
    expect(productAliases(CATALOG[0])).toContain("ลิปสติกสีแดง");
    expect(productAliases(CATALOG[0])).toContain("lip-001");
  });

  it("matches by leading Thai segment", () => {
    expect(matchProduct("ลิปสติกสีแดง ราคาเท่าไหร่", CATALOG)?.id).toBe("1");
  });

  it("matches by SKU", () => {
    expect(matchProduct("อยากได้ BRUSH-01 ค่ะ", CATALOG)?.id).toBe("2");
  });

  it("returns null when nothing matches", () => {
    expect(matchProduct("สวัสดีครับ วันนี้อากาศดี", CATALOG)).toBeNull();
  });

  it("prefers the most specific (longest) alias", () => {
    // Both the full name and SKU could match; longest alias wins deterministically.
    expect(matchProduct("สนใจ ลิปสติกสีแดง Matte", CATALOG)?.id).toBe("1");
  });
});

describe("product + variant matching", () => {
  const EBOOKS: ProductLike[] = [
    {
      id: "e1",
      name: "อีบุ๊กดูดวง",
      sku: "EBOOK-01",
      price: "2290",
      stock: null,
      currency: "THB",
      variants: [
        { id: "v-pdf", name: "PDF", sku: null, price: "1790" },
        { id: "v-hard", name: "เล่มปกแข็ง", sku: null, price: "2290" },
      ],
    },
  ];

  it("resolves a bare variant label to its product + variant", () => {
    const m = matchProductOrVariant("pdf", EBOOKS);
    expect(m?.product.id).toBe("e1");
    expect(m?.variant?.id).toBe("v-pdf");
  });

  it("matches a product named with its variant", () => {
    const m = matchProductOrVariant("เอาอีบุ๊กดูดวง แบบเล่มปกแข็ง", EBOOKS);
    expect(m?.product.id).toBe("e1");
    expect(m?.variant?.id).toBe("v-hard");
  });

  it("matches a product with no variant named (variant left unset)", () => {
    const m = matchProductOrVariant("สนใจอีบุ๊กดูดวงค่ะ", EBOOKS);
    expect(m?.product.id).toBe("e1");
    expect(m?.variant).toBeUndefined();
  });

  it("is ambiguous when a bare variant label spans two products → null", () => {
    const twoPdf: ProductLike[] = [
      { ...EBOOKS[0] },
      {
        id: "e2",
        name: "คู่มือฮวงจุ้ย",
        sku: "EBOOK-02",
        price: "990",
        stock: null,
        currency: "THB",
        variants: [{ id: "v2-pdf", name: "PDF", sku: null, price: "990" }],
      },
    ];
    expect(matchProductOrVariant("pdf", twoPdf)).toBeNull();
  });
});
