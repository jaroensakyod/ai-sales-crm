import { describe, expect, it } from "vitest";

import { buildTagGuidance, classifyTags } from "@/features/tags/classify";

const TAGS = [
  { id: "1", name: "ถามจัดส่ง", keywords: ["ส่ง", "กี่วัน", "ค่าส่ง"], guidance: "ส่ง 2-3 วัน" },
  { id: "2", name: "ถามโปร", keywords: ["โปร", "ลด", "โค้ด"], guidance: "เน้น SALE10" },
];

describe("tag classifier", () => {
  it("matches by keyword", () => {
    expect(classifyTags("ส่งกี่วันคะ", TAGS).map((t) => t.id)).toEqual(["1"]);
    expect(classifyTags("มีโปรไหม", TAGS).map((t) => t.id)).toEqual(["2"]);
  });
  it("can match multiple tags", () => {
    expect(classifyTags("ส่งกี่วัน มีโปรลดไหม", TAGS)).toHaveLength(2);
  });
  it("returns none when nothing matches", () => {
    expect(classifyTags("สวัสดีครับ", TAGS)).toHaveLength(0);
  });
  it("builds a guidance block or null", () => {
    expect(buildTagGuidance([])).toBeNull();
    expect(buildTagGuidance(TAGS)).toContain("SALE10");
  });
});
