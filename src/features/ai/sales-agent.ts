import type { DbClient } from "@/db/client";
import {
  getTenantAiSettings,
  recordAiRun,
  recordUsageEvent,
} from "@/db/repositories/ai";
import { loadProducts } from "@/features/router/rules";
import type { LevelHandler } from "@/features/router/types";

import {
  estimateCostUsd,
  generateWithGemini,
  normalizeModelId,
  type GenerateFn,
} from "./gemini";

type AiSettings = Awaited<ReturnType<typeof getTenantAiSettings>> | null;
type Catalog = Awaited<ReturnType<typeof loadProducts>>;

/**
 * System prompt with hard guardrails baked in. These are instructions to the
 * model, but the real enforcement is in code (banned-phrase filter below,
 * discount authority checked before any action) — we never trust the model's
 * word alone (risk #5).
 */
export function buildSalesSystemPrompt(args: {
  settings: AiSettings;
  catalog: Catalog;
}): string {
  const discount = args.settings?.discountAuthority ?? "0";
  const catalogLines = args.catalog
    .map((p) => `- ${p.name}: ${Number(p.price).toLocaleString("th-TH")} ${p.currency}`)
    .join("\n");

  const rules = [
    "คุณคือผู้ช่วยขายมืออาชีพของร้าน ตอบเป็นภาษาไทย สุภาพ กระชับ เป็นกันเอง",
    "ห้ามอ้างสรรพคุณเกินจริงหรือกล่าวอ้างว่า 'รักษา' โรคใด ๆ เด็ดขาด (ข้อกำหนด อย./สคบ.)",
    `ห้ามเสนอส่วนลดเกิน ${Number(discount).toLocaleString("th-TH")} บาท และห้ามสัญญาโปรโมชั่นที่ไม่มีข้อมูลรองรับ`,
    "ราคาและสต็อกให้ยึดข้อมูลในระบบเท่านั้น ห้ามเดาหรือกุตัวเลขขึ้นเอง",
    "ถ้าไม่แน่ใจหรือเป็นเรื่องคืนเงิน/ร้องเรียน ให้บอกลูกค้าว่าจะส่งต่อให้ทีมงานดูแล",
  ];

  return [
    rules.join("\n"),
    args.catalog.length ? `\nสินค้าในร้าน:\n${catalogLines}` : "",
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
    const systemInstruction = buildSalesSystemPrompt({ settings, catalog });
    const model = settings?.escalationModel ?? "gemini-flash";
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
    const text = result.text.trim();
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
