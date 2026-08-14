import { describe, expect, it, vi } from "vitest";

import { withRetry } from "@/lib/retry";
import { isTransientGeminiError } from "@/features/ai/gemini";

const noSleep = async () => {};

describe("withRetry", () => {
  it("retries a retryable failure then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("429 RESOURCE_EXHAUSTED"))
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("400 bad request"));
    await expect(
      withRetry(fn, { sleep: noSleep, shouldRetry: isTransientGeminiError }),
    ).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 overloaded"));
    await expect(
      withRetry(fn, { retries: 2, sleep: noSleep }),
    ).rejects.toThrow("503");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe("isTransientGeminiError", () => {
  it("flags rate-limit / overload / 5xx", () => {
    expect(isTransientGeminiError(new Error("429"))).toBe(true);
    expect(isTransientGeminiError(new Error("503 UNAVAILABLE"))).toBe(true);
    expect(isTransientGeminiError(new Error("model overloaded"))).toBe(true);
  });
  it("ignores client errors", () => {
    expect(isTransientGeminiError(new Error("404 not found"))).toBe(false);
    expect(isTransientGeminiError(new Error("invalid key"))).toBe(false);
  });
});
