import { GoogleGenAI } from "@google/genai";

import { getGeminiApiKey } from "@/lib/env";
import { withRetry } from "@/lib/retry";

/** Transient Gemini errors worth retrying (rate limit / overloaded / 5xx). */
export function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /(\b429\b|\b500\b|\b503\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|deadline)/i.test(
    msg,
  );
}

/**
 * Map friendly model names stored in tenant_ai_settings to concrete API IDs.
 * Flash-Lite is the cost default; Flash is the escalation model (docs/02-plan.md).
 */
export function normalizeModelId(name: string): string {
  const map: Record<string, string> = {
    // Rolling aliases that track the latest stable flash tiers, so version
    // rotation doesn't break us (pinned versions get retired for new users).
    "gemini-flash-lite": "gemini-flash-lite-latest",
    "gemini-flash": "gemini-flash-latest",
  };
  return map[name] ?? name;
}

export type GenerateArgs = {
  model: string;
  systemInstruction: string;
  userText: string;
};

export type GenerateResult = {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
};

/** Injectable so the router/agent can be tested without a real API key. */
export type GenerateFn = (args: GenerateArgs) => Promise<GenerateResult>;

/** Real Gemini call. Requires GEMINI_API_KEY (billing enabled — risk #6). */
export const generateWithGemini: GenerateFn = async ({
  model,
  systemInstruction,
  userText,
}) => {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: normalizeModelId(model),
        contents: userText,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    { retries: 2, shouldRetry: isTransientGeminiError },
  );
  return {
    text: response.text ?? "",
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
  };
};

/**
 * Rough USD cost per model (per 1M tokens, input/output). Internal metering
 * only — approximate is fine for the cost dashboard + soft-cap (docs/03).
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-flash-lite-latest": { input: 0.1, output: 0.4 },
  "gemini-flash-latest": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
};

export function estimateCostUsd(
  model: string,
  inputTokens = 0,
  outputTokens = 0,
): number {
  const price = PRICE_PER_MTOK[normalizeModelId(model)] ?? {
    input: 0.3,
    output: 2.5,
  };
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}
