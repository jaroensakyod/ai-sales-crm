import { describe, expect, it, vi } from "vitest";

import { transcribeVoice } from "@/features/messaging/voice";

const audio = { data: "AAAA", mimeType: "audio/m4a" };

describe("transcribeVoice", () => {
  it("returns the trimmed transcript", async () => {
    const vision = vi.fn(async (args: { image: { data: string; mimeType: string } }) => {
      expect(args.image).toEqual(audio); // passes the audio through as inline media
      return { text: "  มีสินค้าตัวนี้ไหมคะ \n" };
    });
    const t = await transcribeVoice(audio, vision);
    expect(t).toBe("มีสินค้าตัวนี้ไหมคะ");
    expect(vision).toHaveBeenCalledOnce();
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
