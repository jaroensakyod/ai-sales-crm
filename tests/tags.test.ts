import { describe, expect, it } from "vitest";

import {
  buildTagGuidance,
  classifyTags,
  classifyTagsAI,
} from "@/features/tags/classify";
import { toneInstruction } from "@/features/ai/tone";
import { PRESET_TAGS } from "@/features/tags/presets";

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

describe("AI classifier (meaning-based)", () => {
  it("matches tags by the model's numbered answer", async () => {
    // Model 'understands' a paraphrase and returns index 2 (ถามโปร).
    const matched = await classifyTagsAI("มันเกินงบผมอ่ะ", TAGS, async () => "2");
    expect(matched.map((t) => t.id)).toEqual(["2"]);
  });
  it("returns none on '0' or garbage", async () => {
    expect(await classifyTagsAI("x", TAGS, async () => "0")).toHaveLength(0);
    expect(await classifyTagsAI("x", TAGS, async () => "none")).toHaveLength(0);
  });
});

describe("tone + presets", () => {
  it("maps a tone key to an instruction", () => {
    expect(toneInstruction("FORMAL")).toContain("ทางการ");
    expect(toneInstruction(null)).toBeNull();
    expect(toneInstruction("UNKNOWN")).toBeNull();
  });
  it("ships ready preset tags with guidance", () => {
    expect(PRESET_TAGS.length).toBeGreaterThanOrEqual(4);
    expect(PRESET_TAGS.every((p) => p.keywords.length > 0 && p.guidance)).toBe(true);
  });
});
