import type { DbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { hasGeminiApiKey } from "@/lib/env";

import { generateWithGemini, type GenerateFn } from "./gemini";

/** Non-AI fallback captions, so the feature still works with no API key. */
function templateCaptions(headline: string): string[] {
  return [
    `${headline} 🔥 ของมีจำนวนจำกัด ทักเลยค่ะ`,
    `${headline} — คุ้มสุด ๆ สั่งวันนี้ส่งไว 😊`,
    `ลูกค้าถามหาเยอะมาก! ${headline} พร้อมส่งค่ะ`,
  ];
}

function parseCaptionList(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const arr = JSON.parse(match[0]);
      if (Array.isArray(arr)) {
        return arr.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      }
    } catch {
      // fall through to line parsing
    }
  }
  // Fallback: split lines, strip bullets/numbering.
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean);
}

const SYSTEM =
  "คุณเป็นก๊อปปี้ไรเตอร์ขายของออนไลน์ภาษาไทย เขียนแคปชั่นสั้น กระชับ ชวนซื้อ " +
  "เป็นกันเอง ใส่อิโมจิได้เล็กน้อย ห้ามกล่าวอ้างเกินจริงหรือรักษาโรค";

/**
 * Suggest 3 sales captions for a product/card. Uses the tenant's default model;
 * falls back to fixed templates when there's no API key or the call fails, so
 * the composer button always returns something.
 */
export async function suggestCaptions(
  db: DbClient,
  tenantId: string,
  input: { headline: string; description?: string },
  generate: GenerateFn = generateWithGemini,
): Promise<string[]> {
  const headline = input.headline.trim();
  if (!headline) return [];
  if (!hasGeminiApiKey()) return templateCaptions(headline);

  const settings = await getTenantAiSettings(db, tenantId);
  const prompt =
    `เขียนแคปชั่นขายสินค้า 3 แบบให้เลือก ภาษาไทย แต่ละแบบไม่เกิน 2 บรรทัด\n` +
    `สินค้า: ${headline}\n` +
    `รายละเอียด: ${input.description?.trim() || "-"}\n` +
    `ตอบเป็น JSON array ของสตริงเท่านั้น เช่น ["...","...","..."] ห้ามมีข้อความอื่น`;

  try {
    const res = await generate({
      model: settings?.defaultModel ?? "gemini-flash-lite",
      systemInstruction: SYSTEM,
      userText: prompt,
    });
    const captions = parseCaptionList(res.text).slice(0, 3);
    return captions.length ? captions : templateCaptions(headline);
  } catch {
    return templateCaptions(headline);
  }
}
