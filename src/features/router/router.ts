import type { DbClient } from "@/db/client";
import { setConversationStatus } from "@/db/repositories/conversations";

import {
  hasPriceIntent,
  hasStockIntent,
  matchHandoff,
  matchProduct,
} from "./intent";
import { suggestCrossSells } from "@/db/repositories/products";

import { loadProducts, priceAnswer, stockAnswer } from "./rules";
import type { RouterContext, RouterDecision, RouterHandlers } from "./types";

// Holding messages — the customer never gets left in silence (risk #6).
const HANDOFF_MESSAGE =
  "รบกวนรอสักครู่นะคะ ขอส่งเรื่องให้ทีมงานดูแลและติดต่อกลับค่ะ 🙏";
const FALLBACK_MESSAGE =
  "ขออภัยค่ะ คำถามนี้ขอส่งต่อให้ทีมงานช่วยดูแลนะคะ เดี๋ยวติดต่อกลับค่ะ 🙏";

/**
 * Route one inbound customer message through Levels 1→4:
 *   L1 rule-based (price/stock from DB, no AI)
 *   L2 knowledge search (RAG)     — injected handler
 *   L3 AI reasoning (Gemini)      — injected handler
 *   L4 human handoff              — refund/dispute keywords, or nothing answered
 *
 * Cost + resilience: L1 answers common questions for free and keeps working
 * when Gemini is down; anything unresolved falls to a human rather than a wrong
 * or empty reply (risk #5, risk #6). This function decides + may flip the
 * conversation to HANDOFF; it does NOT send — delivery is the outbound layer.
 */
export async function routeMessage(
  db: DbClient,
  ctx: RouterContext,
  handlers: RouterHandlers = {},
): Promise<RouterDecision> {
  const text = ctx.text.trim();

  // Level 4 short-circuit: sensitive intents skip the AI entirely.
  const handoffKeyword = matchHandoff(text);
  if (handoffKeyword) {
    return handoff(db, ctx, `handoff:${handoffKeyword}`, handoffKeyword, HANDOFF_MESSAGE);
  }

  // Level 1: rule-based answers from live DB data.
  const priceIntent = hasPriceIntent(text);
  const stockIntent = hasStockIntent(text);
  if (priceIntent || stockIntent) {
    const product = matchProduct(text, await loadProducts(db, ctx.tenantId));
    if (product) {
      const parts: string[] = [];
      if (priceIntent) parts.push(priceAnswer(product));
      if (stockIntent) parts.push(stockAnswer(product));
      let replyText = parts.join(" ");

      // Cross-sell on a buying signal (price intent) — the docs' hero use case:
      // curated pairs, not AI guesses.
      if (priceIntent) {
        const cross = await suggestCrossSells(db, ctx.tenantId, product.id);
        if (cross.length > 0) {
          replyText += ` 💡 ลูกค้าส่วนใหญ่ซื้อ "${cross[0].name}" คู่กันด้วยค่ะ`;
        }
      }

      return {
        level: 1,
        action: "answer",
        replyText,
        source: priceIntent ? "rule:price" : "rule:stock",
      };
    }
  }

  // Level 2: knowledge base (RAG).
  if (handlers.knowledgeSearch) {
    const answer = await handlers.knowledgeSearch(ctx);
    if (answer) {
      return { level: 2, action: "answer", replyText: answer, source: "knowledge" };
    }
  }

  // Level 3: AI reasoning.
  if (handlers.aiReason) {
    const answer = await handlers.aiReason(ctx);
    if (answer) {
      return { level: 3, action: "answer", replyText: answer, source: "ai" };
    }
  }

  // Level 4: nothing could answer → hand to a human.
  return handoff(db, ctx, "fallback", "no_answer", FALLBACK_MESSAGE);
}

async function handoff(
  db: DbClient,
  ctx: RouterContext,
  source: string,
  reason: string,
  replyText: string,
): Promise<RouterDecision> {
  if (ctx.conversationId) {
    await setConversationStatus(db, ctx.tenantId, ctx.conversationId, "HANDOFF");
  }
  return { level: 4, action: "handoff", replyText, source, handoffReason: reason };
}
