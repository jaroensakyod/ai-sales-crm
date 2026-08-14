import type { DbClient } from "@/db/client";
import { setProfilingConsent } from "@/db/repositories/customers";
import { getMemory, setMemory } from "@/db/repositories/memories";

/**
 * PDPA profiling opt-in (risk #3, part 2). Personalized profiling needs a
 * SEPARATE opt-in from general T&C, with a real way to decline. We prompt once
 * on the first bot reply and capture the customer's yes/no.
 */
export const CONSENT_PROMPT =
  "📩 ก่อนเริ่มดูแลคุณเป็นพิเศษ ขออนุญาตเก็บข้อมูลการสนทนาเพื่อแนะนำสินค้าให้ตรงใจ " +
  "และส่งข่าวสาร/โปรโมชัน หากยินยอมพิมพ์ 'ยินยอม' หากไม่สะดวกพิมพ์ 'ไม่ยินยอม' ได้เลยค่ะ " +
  "(ไม่ยินยอมก็ใช้บริการได้ตามปกตินะคะ)";

const DECLINE_KEYWORDS = [
  "ไม่ยินยอม",
  "ไม่ยอมรับ",
  "ไม่ตกลง",
  "ปฏิเสธ",
  "no thanks",
  "decline",
];
const ACCEPT_KEYWORDS = ["ยินยอม", "ยอมรับ", "ตกลง", "ยินดี", "accept", "agree"];

export type ConsentReply = "accept" | "decline";

/** Classify a message as a consent reply. Decline is checked first so
 *  "ไม่ยินยอม" doesn't match the "ยินยอม" accept keyword. */
export function detectConsentReply(text: string): ConsentReply | null {
  const n = text.toLowerCase();
  if (DECLINE_KEYWORDS.some((k) => n.includes(k.toLowerCase()))) return "decline";
  if (ACCEPT_KEYWORDS.some((k) => n.includes(k.toLowerCase()))) return "accept";
  return null;
}

const PROMPTED_KEY = "consent_prompted";
const DECLINED_KEY = "consent_declined";

export type ConsentState = { decided: boolean; granted: boolean; prompted: boolean };

export async function getConsentState(
  db: DbClient,
  tenantId: string,
  customerId: string,
  profilingConsent: boolean,
): Promise<ConsentState> {
  const declined = await getMemory(db, tenantId, customerId, DECLINED_KEY);
  const prompted = await getMemory(db, tenantId, customerId, PROMPTED_KEY);
  return {
    decided: profilingConsent || declined === "true",
    granted: profilingConsent,
    prompted: prompted === "true",
  };
}

export async function markConsentPrompted(
  db: DbClient,
  tenantId: string,
  customerId: string,
): Promise<void> {
  await setMemory(db, tenantId, customerId, PROMPTED_KEY, "true");
}

/** Apply the customer's decision and return an acknowledgment message. */
export async function applyConsentReply(
  db: DbClient,
  tenantId: string,
  customerId: string,
  reply: ConsentReply,
): Promise<string> {
  if (reply === "accept") {
    await setProfilingConsent(db, tenantId, customerId, true);
    return "ขอบคุณค่ะ 🙏 เราจะดูแลข้อมูลของคุณอย่างปลอดภัยตามนโยบายความเป็นส่วนตัว";
  }
  await setMemory(db, tenantId, customerId, DECLINED_KEY, "true");
  return "รับทราบค่ะ เราจะไม่นำข้อมูลไปใช้เพื่อการตลาดส่วนบุคคล ยินดีให้บริการตามปกตินะคะ 😊";
}
