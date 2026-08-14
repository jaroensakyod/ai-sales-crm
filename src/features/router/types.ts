export type RouterLevel = 1 | 2 | 3 | 4;

export type RouterContext = {
  tenantId: string;
  conversationId?: string;
  text: string;
};

/**
 * A single routed decision. `replyText` is always the message to send the
 * customer (for handoff it's a holding message); actual delivery happens in the
 * outbound layer, not here.
 */
export type RouterDecision = {
  level: RouterLevel;
  action: "answer" | "handoff";
  replyText: string;
  source: string; // "rule:price", "rule:stock", "knowledge", "ai", "handoff:คืนเงิน", "fallback"
  handoffReason?: string;
};

/** Level 2 (RAG) and Level 3 (Gemini) are injected so the core stays testable
 *  and the app degrades gracefully when they're absent (risk #6). */
export type LevelHandler = (ctx: RouterContext) => Promise<string | null>;

export type RouterHandlers = {
  knowledgeSearch?: LevelHandler; // Level 2
  aiReason?: LevelHandler; // Level 3
};
