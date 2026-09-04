import { describe, expect, it } from "vitest";

import { formatVariantDisplayName } from "@/lib/product-name";

describe("formatVariantDisplayName", () => {
  it("combines product + variant when they're distinct", () => {
    expect(formatVariantDisplayName("อีบุ๊กดูดวง", "PDF")).toBe("อีบุ๊กดูดวง (PDF)");
  });

  it("does not nest when the variant name already repeats the product/tier (review)", () => {
    // The bug shipped "Standard (Standard (PDF))" — product "Standard",
    // variant "Standard (PDF)". Keep the more specific variant name only.
    expect(formatVariantDisplayName("Standard", "Standard (PDF)")).toBe(
      "Standard (PDF)",
    );
  });

  it("keeps the product name when it already covers the variant", () => {
    expect(formatVariantDisplayName("อีบุ๊กดูดวง (PDF)", "PDF")).toBe(
      "อีบุ๊กดูดวง (PDF)",
    );
  });

  it("returns the product name when there's no variant", () => {
    expect(formatVariantDisplayName("อีบุ๊กดูดวง", null)).toBe("อีบุ๊กดูดวง");
    expect(formatVariantDisplayName("อีบุ๊กดูดวง", undefined)).toBe("อีบุ๊กดูดวง");
    expect(formatVariantDisplayName("อีบุ๊กดูดวง", "  ")).toBe("อีบุ๊กดูดวง");
  });

  it("matches case-insensitively", () => {
    expect(formatVariantDisplayName("premium", "PREMIUM (เล่ม)")).toBe(
      "PREMIUM (เล่ม)",
    );
  });
});
