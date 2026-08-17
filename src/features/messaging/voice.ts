import { generateFromImage, type VisionFn } from "@/features/ai/gemini";

const SYSTEM =
  "You transcribe Thai (or mixed Thai/English) customer voice messages to text. " +
  "Return ONLY the transcript — no quotes, no translation, no explanation.";

const PROMPT =
  "Transcribe this voice message to text exactly as spoken. " +
  "If it is unintelligible or silent, return an empty string.";

/**
 * Turn a customer's voice message into text so the normal chat pipeline can
 * handle it. Reuses the Gemini media call (inlineData works for audio too).
 * `vision` is injectable for tests. Returns null on empty/failed transcription
 * so the caller can ask the customer to type instead — never throws.
 */
export async function transcribeVoice(
  audio: { data: string; mimeType: string },
  vision: VisionFn = generateFromImage,
): Promise<string | null> {
  try {
    const res = await vision({
      model: "gemini-flash-lite",
      systemInstruction: SYSTEM,
      prompt: PROMPT,
      image: audio,
    });
    const text = res.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
