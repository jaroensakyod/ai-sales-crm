import { generateFromImage, type VisionFn } from "@/features/ai/gemini";

/** What we read off a Thai bank-transfer slip. Any field may be missing when
 *  the image is unclear; `amount` is the one that matters for verification. */
export type ParsedSlip = {
  amount: number | null;
  transferredAt?: string | null;
  senderName?: string | null;
  receiverName?: string | null;
  ref?: string | null;
};

export type SlipVerifyStatus =
  | "MATCH" // slip amount equals the order total
  | "MISMATCH" // readable, but a different amount
  | "UNREADABLE"; // couldn't read an amount off the image

export type SlipVerdict = {
  status: SlipVerifyStatus;
  verifiedAmount: number | null;
  parsed: ParsedSlip;
};

/** Amounts within this many baht are treated as equal (rounding on slips). */
const AMOUNT_TOLERANCE = 1;

const SYSTEM =
  "You extract structured data from Thai bank-transfer / PromptPay slip images. " +
  "Return ONLY a JSON object, no markdown, no explanation.";

const PROMPT =
  "Read this payment slip and return JSON with exactly these keys: " +
  '{"amount": number|null, "transferredAt": string|null, "senderName": string|null, ' +
  '"receiverName": string|null, "ref": string|null}. ' +
  "amount is the transferred amount in THB as a plain number (e.g. 1250.50), " +
  "no currency symbol or thousands separators. transferredAt is the date/time text " +
  "on the slip. ref is the transaction id / reference number. " +
  "Use null for anything you cannot read clearly. Do not guess the amount.";

/**
 * Turn the model's text output into a ParsedSlip. Tolerant of markdown code
 * fences and stray prose around the JSON. Never throws — returns all-null on
 * anything it can't parse, which the caller treats as UNREADABLE.
 */
export function parseSlipJson(raw: string): ParsedSlip {
  const empty: ParsedSlip = { amount: null };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return empty;
  }
  return {
    amount: toAmount(obj.amount),
    transferredAt: toStr(obj.transferredAt),
    senderName: toStr(obj.senderName),
    receiverName: toStr(obj.receiverName),
    ref: toStr(obj.ref),
  };
}

/** Compare a parsed slip to the order total. Pure — no I/O, easy to test. */
export function evaluateSlip(parsed: ParsedSlip, orderTotal: number): SlipVerdict {
  if (parsed.amount == null) {
    return { status: "UNREADABLE", verifiedAmount: null, parsed };
  }
  const status: SlipVerifyStatus =
    Math.abs(parsed.amount - orderTotal) <= AMOUNT_TOLERANCE ? "MATCH" : "MISMATCH";
  return { status, verifiedAmount: parsed.amount, parsed };
}

/**
 * Full slip check: OCR the image, then compare to the order total. `vision` is
 * injectable so tests never hit the API. Returns UNREADABLE (never throws) if
 * the model call fails, so a flaky OCR never blocks the acknowledgement.
 */
export async function verifySlip(
  image: { data: string; mimeType: string },
  orderTotal: number,
  vision: VisionFn = generateFromImage,
): Promise<SlipVerdict> {
  let text: string;
  try {
    const res = await vision({
      model: "gemini-flash-lite",
      systemInstruction: SYSTEM,
      prompt: PROMPT,
      image,
    });
    text = res.text;
  } catch {
    return { status: "UNREADABLE", verifiedAmount: null, parsed: { amount: null } };
  }
  return evaluateSlip(parseSlipJson(text), orderTotal);
}

function toAmount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[, ฿]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
}

function toStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
