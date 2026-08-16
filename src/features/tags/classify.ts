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
