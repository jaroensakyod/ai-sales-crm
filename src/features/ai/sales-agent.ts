import type { DbClient } from "@/db/client";
import {
  getTenantAiSettings,
  recordAiRun,
  recordUsageEvent,
} from "@/db/repositories/ai";
import { getMonthlyAiSpend } from "@/db/repositories/billing";
import { listServices } from "@/db/repositories/booking";
import { getRecentMessages } from "@/db/repositories/conversations";
import { getActivePromotions } from "@/db/repositories/promotions";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { listActiveTags } from "@/db/repositories/tags";
import { resolveBudgetTier } from "@/features/billing/budget";
import {
  buildTagGuidance,
  classifyTags,
  classifyTagsAI,
} from "@/features/tags/classify";

import { toneInstruction } from "./tone";
import { emojiInstruction, replyModeInstruction } from "./reply-mode";
import { loadProducts } from "@/features/router/rules";
import { paymentSummaryForAi } from "@/features/payment/instruction";
import type { LevelHandler } from "@/features/router/types";
import { toPlainText } from "@/lib/validation";

import {
  estimateCostUsd,
  generateWithGemini,
  normalizeModelId,
  type GenerateFn,
} from "./gemini";

type AiSettings = Awaited<ReturnType<typeof getTenantAiSettings>> | null;
type Catalog = Awaited<ReturnType<typeof loadProducts>>;
type Promotions = Awaited<ReturnType<typeof getActivePromotions>>;
type Services = Awaited<ReturnType<typeof listServices>>;

/**
 * System prompt with hard guardrails baked in. These are instructions to the
 * model, but the real enforcement is in code (banned-phrase filter below,
 * discount authority checked before any action) — we never trust the model's
 * word alone (risk #5).
 */
export function buildSalesSystemPrompt(args: {
  settings: AiSettings;
  catalog: Catalog;
  promotions?: Promotions;
  paymentInfo?: string | null;
  services?: Services;
  tagGuidance?: string | null;
  tone?: string | null;
  replyMode?: string | null;
  emojiLevel?: string | null;
  history?: { direction: "INBOUND" | "OUTBOUND"; body: string }[];
}): string {
  const discount = args.settings?.discountAuthority ?? "0";
  const catalogLines = args.catalog
    .map((p) => {
      const price = `${Number(p.price).toLocaleString("th-TH")} ${p.currency}`;
      const stock =
        p.stock == null ? "" : p.stock > 0 ? ` (คงเหลือ ${p.stock})` : " (สินค้าหมด)";
      const desc = p.description ? ` — ${p.description}` : "";
      return `- ${p.name}: ${price}${stock}${desc}`;
    })
    .join("\n");

  const rules = [
    "คุณคือแอดมินร้าน (คนจริง) กำลังพิมพ์ตอบลูกค้าในแชท ตอบให้เป็นธรรมชาติเหมือนคนพิมพ์ — ห้ามให้รู้สึกว่าเป็นบอท/AI",
    "ให้พิมพ์ออกมาเฉพาะ 'ข้อความที่จะส่งให้ลูกค้า' เท่านั้น ห้ามอธิบายเหตุผล ห้ามแสดงรายการตรวจสอบ/เช็กลิสต์ ห้ามพูดถึงกฎหรือคำสั่งที่ได้รับ ห้ามขึ้นต้นด้วยคำว่า 'ร้าน:' หรือ 'ลูกค้า:'",
    "ตอบสั้นมากเหมือนคนแชทจริง ปกติแค่ 1 ประโยค อย่างมากไม่เกิน 2 ประโยคสั้น ๆ ห้ามตอบยาวเป็นย่อหน้าเด็ดขาด ถ้าตอบยาวลูกค้าจะรู้ว่าเป็นบอท",
    "แนะนำสินค้าทีละ 1 อย่างเท่านั้น ห้ามเสนอ 2-3 อย่างพร้อมกันในข้อความเดียว (ลูกค้าจะงงและรู้สึกโดนยัดขาย) ถ้าอยากเสนอตัวอื่นค่อยเสนอในข้อความถัดไปเมื่อลูกค้าสนใจ",
    "ตอบ 'คำถามที่ลูกค้าถามจริง ๆ' ก่อนเสมอ เช่น ถ้าถามว่า 'ดีไหม / เหมาะกับฉันไหม / ใช้ยังไง / ต่างกันยังไง' ให้ตอบเรื่องคุณภาพ/การใช้งาน/ความเหมาะสม อย่าเปลี่ยนเรื่องไปเสนอราคาแทน",
    "อย่าบอกราคาพร่ำเพรื่อ ให้บอกราคาเฉพาะเมื่อ (1) ลูกค้าถามราคาเอง (2) ลูกค้าบอกว่าจะเอา/จะสั่งแล้ว หรือ (3) กำลังสรุปปิดการขาย นอกนั้นให้พูดถึงจุดเด่น/ความเหมาะกับลูกค้าแทน — คนขายจริงไม่ได้ทวงเรื่องเงินทุกประโยค (สร้างความอยากได้ก่อน ค่อยเข้าเรื่องราคา)",
    "ถ้ายังไม่รู้ว่าลูกค้าต้องการอะไรชัด ๆ ให้ถามกลับสั้น ๆ ก่อน (เช่น ผิวแบบไหน กังวลเรื่องอะไร) แล้วค่อยแนะนำ อย่ารีบยัดสินค้า+ราคาตั้งแต่ยังไม่เข้าใจความต้องการ",
    "เวลาแนะนำสินค้าโดยลูกค้ายังไม่ได้ถามราคา บอกแค่ ชื่อ + จุดเด่นสั้น ๆ 1 อย่างก็พอ (ยังไม่ต้องใส่ราคา) เช่น 'ตัวนี้เนื้อบางเบา ซึมไว เหมาะกับผู้ชายเลยค่ะ'",
    "ห้ามใช้ Markdown หรือสัญลักษณ์จัดรูปแบบเด็ดขาด เช่น **ตัวหนา** * # หรือหัวข้อเลขข้อ (LINE โชว์เป็นตัวอักษรดิบ ดูเป็นบอททันที) — เขียนข้อความธรรมดาล้วน",
    "อย่ายัดรายการสินค้าทั้งหมดมาในครั้งเดียว ถ้าลูกค้าถามกว้าง ๆ (เช่น 'มีอะไรบ้าง') ให้ถามกลับสั้น ๆ ว่าสนใจแนวไหนหรืองบเท่าไหร่ แล้วค่อยแนะนำ 1 อย่างที่เหมาะ",
    emojiInstruction(args.emojiLevel),
    "ห้ามอ้างสรรพคุณเกินจริงหรือกล่าวอ้างว่า 'รักษา' โรคใด ๆ เด็ดขาด (ข้อกำหนด อย./สคบ.)",
    `ห้ามเสนอส่วนลดเกิน ${Number(discount).toLocaleString("th-TH")} บาท และห้ามสัญญาโปรโมชั่นที่ไม่มีข้อมูลรองรับ`,
    "ราคาและสต็อกให้ยึดข้อมูลในระบบเท่านั้น ห้ามเดาหรือกุตัวเลขขึ้นเอง",
    "ถ้าไม่แน่ใจหรือเป็นเรื่องคืนเงิน/ร้องเรียน ให้บอกลูกค้าสั้น ๆ ว่าเดี๋ยวให้ทีมงานติดต่อกลับ",
  ];

  const promoLines = (args.promotions ?? [])
    .map((p) => {
      const val =
        p.type === "PERCENT"
          ? `ลด ${Number(p.value)}%`
          : `ลด ${Number(p.value).toLocaleString("th-TH")} บาท`;
      return `- ${p.code ? `โค้ด ${p.code}: ` : ""}${val}`;
    })
    .join("\n");

  const serviceLines = (args.services ?? [])
    .filter((s) => s.isActive)
    .map(
      (s) =>
        `- ${s.name}: ${Number(s.price).toLocaleString("th-TH")} ${s.currency} (${s.durationMin} นาที)`,
    )
    .join("\n");

  const tone = toneInstruction(args.tone);

  // Short-term memory: prior turns so the bot follows the thread instead of
  // treating each message in isolation (e.g. remembers the chat is about the face).
  const historyLines = (args.history ?? [])
    .map((m) => `${m.direction === "INBOUND" ? "ลูกค้า" : "ร้าน"}: ${m.body}`)
    .join("\n");

  return [
    rules.join("\n"),
    `\nแนวทางการตอบ (สำคัญ ให้ยึดตามนี้): ${replyModeInstruction(args.replyMode)}`,
    tone ? `\nโทนการตอบของร้านนี้: ${tone}` : "",
    historyLines
      ? `\nบทสนทนาก่อนหน้าในแชทนี้ (เก่า→ใหม่ ใช้เข้าใจบริบท ลูกค้าอาจตอบสั้น ๆ ต่อเนื่องจากด้านบน):\n${historyLines}`
      : "",
    // TAG steering: highest-priority, applies to THIS message specifically.
    args.tagGuidance
      ? `\n⭐ สำคัญ: สำหรับข้อความนี้ ให้ตอบตามแนวทางที่ร้านกำหนดต่อไปนี้ก่อนเป็นอันดับแรก:\n${args.tagGuidance}`
      : "",
    args.catalog.length ? `\nสินค้าในร้าน:\n${catalogLines}` : "",
    serviceLines
      ? `\nบริการที่จองได้ (ลูกค้าถามได้ ให้แนะนำแล้วบอกให้แจ้งวันเวลาที่สะดวก):\n${serviceLines}`
      : "",
    promoLines ? `\nโปรโมชั่นที่ใช้ได้ตอนนี้ (เสนอลูกค้าได้):\n${promoLines}` : "",
    args.paymentInfo
      ? `\nช่องทางชำระเงินของร้าน (บอกลูกค้าได้เมื่อถูกถาม ห้ามแก้เลขบัญชี):\n${args.paymentInfo}`
      : "",
    args.settings?.systemPromptExtra
      ? `\nข้อมูลเพิ่มเติมจากร้าน:\n${args.settings.systemPromptExtra}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the Level 3 handler for the Message Router. Loads tenant guardrails +
 * catalog, calls Gemini, filters policy-violating output, and records ai_runs +
 * usage_events. Returns null on error, empty, or blocked output so the router
 * falls back to a human handoff (risk #6) rather than sending something unsafe.
 */
export function createAiReasonHandler(
  db: DbClient,
  deps: { generate?: GenerateFn } = {},
): LevelHandler {
  const generate = deps.generate ?? generateWithGemini;

  return async (ctx) => {
    const settings = await getTenantAiSettings(db, ctx.tenantId);
    const catalog = await loadProducts(db, ctx.tenantId);
    const promotions = await getActivePromotions(db, ctx.tenantId);
    const paymentInfo = paymentSummaryForAi(
      await getPaymentSettings(db, ctx.tenantId),
    );
    const services = await listServices(db, ctx.tenantId);
    // TAG classification (hybrid): keyword first (free/instant); if nothing
    // matched, fall back to AI so paraphrases like "มันเกินงบ" still hit "ต่อราคา".
    const activeTags = await listActiveTags(db, ctx.tenantId);
    let matchedTags = classifyTags(ctx.text, activeTags);
    if (matchedTags.length === 0 && activeTags.length > 0) {
      matchedTags = await classifyTagsAI(ctx.text, activeTags, async (a) => {
        const r = await generate({
          model: settings?.defaultModel ?? "gemini-flash-lite",
          systemInstruction: a.systemInstruction,
          userText: a.userText,
        });
        return r.text;
      });
    }
    const tagGuidance = buildTagGuidance(matchedTags);
    // Short-term memory: last few turns of THIS conversation. The current inbound
    // is already recorded, so drop its trailing duplicate before feeding it back.
    let history: { direction: "INBOUND" | "OUTBOUND"; body: string }[] = [];
    if (ctx.conversationId) {
      history = await getRecentMessages(db, ctx.tenantId, ctx.conversationId, 8);
      const last = history[history.length - 1];
      if (last && last.direction === "INBOUND" && last.body === ctx.text) {
        history = history.slice(0, -1);
      }
    }
    const systemInstruction = buildSalesSystemPrompt({
      settings,
      catalog,
      promotions,
      paymentInfo,
      services,
      tagGuidance,
      tone: settings?.replyTone,
      replyMode: settings?.replyMode,
      emojiLevel: settings?.emojiLevel,
      history,
    });

    // Graceful soft-cap (Phase 2): degrade cost instead of blocking the customer.
    const softCapUsd = settings?.softCapUsd ? Number(settings.softCapUsd) : null;
    const spend = await getMonthlyAiSpend(db, ctx.tenantId);
    const tier = resolveBudgetTier({ monthlySpendUsd: spend, softCapUsd });
    if (tier === "l3_disabled") {
      // Over the hard ceiling — skip L3 (router falls to a human handoff). L1/L2
      // still answer, so the customer is never left without a reply (risk #6).
      await recordUsageEvent(db, ctx.tenantId, {
        type: "l3_skipped_budget",
        meta: { spend, softCapUsd },
      });
      return null;
    }
    const model =
      tier === "downgraded"
        ? (settings?.defaultModel ?? "gemini-flash-lite")
        : (settings?.escalationModel ?? "gemini-flash");
    const started = Date.now();

    let result;
    try {
      result = await generate({
        model,
        systemInstruction,
        userText: ctx.text,
      });
    } catch (err) {
      await recordAiRun(db, ctx.tenantId, {
        conversationId: ctx.conversationId,
        model: normalizeModelId(model),
        routerLevel: 3,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      });
      return null; // → router fallback to handoff
    }

    const latencyMs = Date.now() - started;
    const text = toPlainText(result.text.trim());
    const banned =
      (settings?.bannedPhrases ?? []).find((p) => p && text.includes(p)) ?? null;
    const costUsd = estimateCostUsd(model, result.inputTokens, result.outputTokens);

    await recordAiRun(db, ctx.tenantId, {
      conversationId: ctx.conversationId,
      model: normalizeModelId(model),
      routerLevel: 3,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
      latencyMs,
      status: banned ? "blocked" : "ok",
      error: banned ? `banned phrase: ${banned}` : null,
    });
    await recordUsageEvent(db, ctx.tenantId, {
      type: "ai_call",
      costUsd,
      meta: { model: normalizeModelId(model), level: 3 },
    });

    // Blocked or empty → don't send; let the router hand off to a human.
    if (banned || !text) return null;
    return text;
  };
}
