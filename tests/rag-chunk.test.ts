import { describe, expect, it } from "vitest";

import { chunkText } from "@/features/ai/rag";

describe("chunkText", () => {
  it("keeps small docs as a single chunk", () => {
    const chunks = chunkText("บรรทัดเดียวสั้นๆ");
    expect(chunks).toHaveLength(1);
  });

  it("splits on paragraph boundaries when over the limit", () => {
    const para = "ก".repeat(400);
    const chunks = chunkText(`${para}\n\n${para}\n\n${para}`, 600);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 600)).toBe(true);
  });

  it("hard-splits an oversized paragraph", () => {
    const chunks = chunkText("ข".repeat(2000), 600);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
});
