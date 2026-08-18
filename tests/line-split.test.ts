import { describe, expect, it } from "vitest";

import { splitMessageForLine } from "@/features/line/client";

describe("splitMessageForLine", () => {
  it("keeps a short reply as a single bubble", () => {
    expect(splitMessageForLine("สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ")).toEqual([
      "สวัสดีค่ะ มีอะไรให้ช่วยไหมคะ",
    ]);
  });

  it("returns empty for blank text", () => {
    expect(splitMessageForLine("   \n\n  ")).toEqual([]);
  });

  it("packs small paragraphs together under the soft limit", () => {
    const text = "ย่อหน้าหนึ่ง\n\nย่อหน้าสอง\n\nย่อหน้าสาม";
    // All tiny → stays one bubble.
    expect(splitMessageForLine(text)).toEqual([
      "ย่อหน้าหนึ่ง\n\nย่อหน้าสอง\n\nย่อหน้าสาม",
    ]);
  });

  it("splits long paragraphs into separate bubbles", () => {
    const para = (label: string) => `${label}: ` + "ก".repeat(80);
    const text = [para("A"), para("B"), para("C")].join("\n\n");
    const bubbles = splitMessageForLine(text, { softLimit: 100 });
    expect(bubbles.length).toBe(3);
    expect(bubbles[0]).toContain("A:");
    expect(bubbles[2]).toContain("C:");
  });

  it("never exceeds the max bubble count (overflow merged into the last)", () => {
    const paras = Array.from({ length: 12 }, (_, i) => `ก${i} ` + "ข".repeat(80));
    const bubbles = splitMessageForLine(paras.join("\n\n"), {
      softLimit: 100,
      maxBubbles: 5,
    });
    expect(bubbles.length).toBe(5);
    // Nothing is dropped — the last bubble carries the remainder.
    expect(bubbles[4]).toContain("ก11");
  });

  it("hard-splits a single over-long line with no breaks", () => {
    const bubbles = splitMessageForLine("ก".repeat(2500), { softLimit: 900 });
    expect(bubbles.length).toBe(3);
    expect(bubbles.every((b) => b.length <= 900)).toBe(true);
  });
});
