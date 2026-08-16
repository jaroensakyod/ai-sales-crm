/**
 * Tag classifier (the "Query Classifier → TAG" step). Pure keyword matching so
 * it's cheap and deterministic; every matched tag contributes its guidance to
 * steer the AI reply.
 */
export type TagLike = {
  id: string;
  name: string;
  keywords: string[];
  guidance: string;
};

export function classifyTags<T extends TagLike>(text: string, tags: T[]): T[] {
  const n = text.toLowerCase();
  return tags.filter((t) =>
    t.keywords.some((k) => {
      const kw = k.trim().toLowerCase();
      return kw.length > 0 && n.includes(kw);
    }),
  );
}

/** Build the steering block injected into the LLM prompt for matched tags. */
export function buildTagGuidance(tags: TagLike[]): string | null {
  if (tags.length === 0) return null;
  return tags.map((t) => `- (${t.name}) ${t.guidance}`).join("\n");
}

/** Minimal generate signature for AI classification (returns raw text). */
export type ClassifyGenerate = (args: {
  systemInstruction: string;
  userText: string;
}) => Promise<string>;

/**
 * AI-based classifier (understands meaning, not just exact keywords). Asks the
 * model which tags apply and returns the matched ones. Used as a fallback when
 * keyword matching finds nothing, so it only costs a call when needed.
 */
export async function classifyTagsAI<T extends TagLike>(
  text: string,
  tags: T[],
  generate: ClassifyGenerate,
): Promise<T[]> {
  if (tags.length === 0) return [];
  const list = tags.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  const systemInstruction =
    "คุณเป็นตัวจัดหมวดข้อความลูกค้า จับว่าข้อความตรงกับ 'หมวด' ใดต่อไปนี้บ้าง " +
    "ตอบเป็นเลขข้อคั่นด้วยจุลภาคเท่านั้น (เช่น 1,3) ถ้าไม่ตรงหมวดใดเลยตอบ 0 " +
    "ห้ามอธิบายเพิ่ม:\n" +
    list;
  let out: string;
  try {
    out = await generate({ systemInstruction, userText: text });
  } catch {
    return [];
  }
  const nums = new Set((out.match(/\d+/g) ?? []).map(Number));
  return tags.filter((_, i) => nums.has(i + 1));
}
