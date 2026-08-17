import { describe, expect, it, vi } from "vitest";

import { transcribeVoice } from "@/features/messaging/voice";

const audio = { data: "AAAA", mimeType: "audio/m4a" };

describe("transcribeVoice", () => {
  it("returns the trimmed transcript", async () => {
    const vision = vi.fn(async () => ({ text: "  มีสินค้าตัวนี้ไหมคะ \n" }));
    const t = await transcribeVoice(audio, vision);
    expect(t).toBe("มีสินค้าตัวนี้ไหมคะ");
    expect(vision).toHaveBeenCalledOnce();
    // passes the audio through as inline media
    expect(vision.mock.calls[0][0].image).toEqual(audio);
  });

  it("returns null for an empty/blank transcript", async () => {
    const vision = vi.fn(async () => ({ text: "   " }));
    expect(await transcribeVoice(audio, vision)).toBeNull();
  });

  it("returns null (never throws) when transcription fails", async () => {
    const vision = vi.fn(async () => {
      throw new Error("boom");
    });
    expect(await transcribeVoice(audio, vision)).toBeNull();
  });
});
