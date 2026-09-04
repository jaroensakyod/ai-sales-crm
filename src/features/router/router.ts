import type { DbClient } from "@/db/client";
import { setConversationStatus } from "@/db/repositories/conversations";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { emojiAllowed, modeAllowsCrossSell } from "@/features/ai/reply-mode";

import {
  hasPaymentHowToIntent,
  hasPriceIntent,
  hasStockIntent,
  matchFrustration,
  matchHandoff,
  matchProduct,
} from "./intent";
import { suggestCrossSells } from "@/db/repositories/products";

import { loadProducts, priceAnswer, stockAnswer } from "./rules";
import type { RouterContext, RouterDecision, RouterHandlers } from "./types";

// Holding messages — the customer never gets left in silence (risk #6). Both set
// an expectation of *when* a human replies; "รอสักครู่" alone read badly at 5am
// with no follow-up in sight (review: handoff gave no callback timeframe).
const HANDOFF_MESSAGE =
  "รับเรื่องแล้วนะคะ เดี๋ยวทีมงานติดต่อกลับโดยเร็วที่สุดในเวลาทำการค่ะ 🙏";
const FALLBACK_MESSAGE =
  "ขออภัยค่ะ คำถามนี้ขอส่งต่อให้ทีมงานดูแลนะคะ เดี๋ยวติดต่อกลับโดยเร็วที่สุดในเวลาทำการค่ะ 🙏";
// "How do I buy/pay?" — deterministic so we never say "ไม่รู้" to a buyer. Stays
// in step with the AI's payment policy: never volunteer bank details, steer to
// the confirm-order button, and the checkout flow sends the transfer info.
const PAYMENT_HOWTO_MESSAGE =
  "สั่งซื้อง่ายมากค่ะ แค่แจ้งรุ่นที่ต้องการแล้วกดยืนยันสั่งซื้อ เดี๋ยวระบบส่งข้อมูลการโอนให้เลยค่ะ";

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

  // Frustrated/angry customer → hand to a human immediately. Staying silent here
  // is the worst possible move (review #2); a person should take over the thread.
  const frustration = matchFrustration(text);
  if (frustration) {
    return handoff(db, ctx, `handoff:${frustration}`, frustration, HANDOFF_MESSAGE);
  }

  // Level 1: rule-based answers from live DB data.
  const priceIntent = hasPriceIntent(text);
  const stockIntent = hasStockIntent(text);

  // "How do I buy/pay?" — answer deterministically before the AI can drop it.
  // (Skip if a price/stock question rides along — that gets a real answer below.)
  if (hasPaymentHowToIntent(text) && !priceIntent && !stockIntent) {
    return {
      level: 1,
      action: "answer",
      replyText: PAYMENT_HOWTO_MESSAGE,
      source: "rule:payment",
    };
  }

  if (priceIntent || stockIntent) {
    const catalog = await loadProducts(db, ctx.tenantId);
    const product = matchProduct(text, catalog);
    if (product) {
      const parts: string[] = [];
      if (priceIntent) parts.push(priceAnswer(product));
      if (stockIntent) parts.push(stockAnswer(product));
      let replyText = parts.join(" ");

      // Cross-sell on a buying signal (price intent) — the docs' hero use case:
      // curated pairs, not AI guesses. Only for selling modes (respects the
      // merchant's "don't over-sell" setting); emoji only if they allow it.
      if (priceIntent) {
        const settings = await getTenantAiSettings(db, ctx.tenantId);
        if (modeAllowsCrossSell(settings?.replyMode)) {
          const cross = await suggestCrossSells(db, ctx.tenantId, product.id);
          if (cross.length > 0) {
            const spark = emojiAllowed(settings?.emojiLevel) ? "💡 " : "";
            // Suggest up to 2 curated pairs (by weight) — a bit more cross-sell
            // without overwhelming the customer.
            const names = cross
              .slice(0, 2)
              .map((c) => `"${c.name}"`)
              .join(" หรือ ");
            replyText += ` ${spark}ลูกค้าส่วนใหญ่ซื้อ ${names} คู่กันด้วยค่ะ`;
          }
        }
      }

      return {
        level: 1,
        action: "answer",
        replyText,
        source: priceIntent ? "rule:price" : "rule:stock",
      };
    }

    // Price/stock asked but no product named. The AI handled this inconsistently
    // (three "ราคาเท่าไหร่" got nothing; a bare "?" dumped the whole price list) —
    // review #3. Resolve it deterministically: one product → just answer it; a few
    // products → ask which one instead of guessing. Only price gets the shortcut
    // (a bare "มีของไหม" is too vague to pin to a single item).
    if (catalog.length === 1) {
      const only = catalog[0];
      const parts: string[] = [];
      if (priceIntent) parts.push(priceAnswer(only));
      if (stockIntent) parts.push(stockAnswer(only));
      return {
        level: 1,
        action: "answer",
        replyText: parts.join(" "),
        source: priceIntent ? "rule:price" : "rule:stock",
      };
    }
    if (priceIntent && catalog.length > 1) {
      const shortlist = catalog.slice(0, 5);
      const names = shortlist.map((p) => p.name).join(" / ");
      return {
        level: 1,
        action: "answer",
        replyText: `สนใจตัวไหนดีคะ มี ${names} แจ้งชื่อรุ่นได้เลย เดี๋ยวบอกราคาให้ค่ะ`,
        source: "rule:price_clarify",
        // Tappable product chips — tapping asks the price of that exact product, so
        // the buttons here match what the customer is actually choosing between.
        chips: shortlist.map((p) => ({
          label: p.name,
          text: `${p.name} ราคาเท่าไหร่`,
        })),
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
