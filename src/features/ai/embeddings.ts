import { GoogleGenAI } from "@google/genai";

import { getGeminiApiKey } from "@/lib/env";

/** RAG embedding dimension — must match the vector(768) column. */
export const EMBEDDING_DIM = 768;
const EMBEDDING_MODEL = "gemini-embedding-001";

export type EmbedFn = (text: string) => Promise<number[]>;

/** L2-norm to unit length. Google recommends normalizing when the output
 *  dimension is reduced below 3072, so cosine distance behaves correctly. */
export function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const x of vec) sum += x * x;
  const mag = Math.sqrt(sum);
  return mag > 0 ? vec.map((x) => x / mag) : vec;
}

/** Real Gemini embedding at 768 dims, normalized. Injectable via EmbedFn. */
export const embedWithGemini: EmbedFn = async (text: string) => {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { outputDimensionality: EMBEDDING_DIM },
  });
  const values = res.embeddings?.[0]?.values;
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding returned ${values?.length ?? 0} dims, expected ${EMBEDDING_DIM}`,
    );
  }
  return normalize(values);
};
