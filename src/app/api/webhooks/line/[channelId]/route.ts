import { after } from "next/server";

import { createDbClient } from "@/db/client";
import { createKnowledgeSearchHandler } from "@/features/ai/rag";
import { createAiReasonHandler } from "@/features/ai/sales-agent";
import { processLineWebhook } from "@/features/line/webhook";
import { hasGeminiApiKey } from "@/lib/env";

// Multi-tenant LINE webhook: each OA is configured with a URL carrying its own
// channelId, so one endpoint serves every tenant. The per-OA channel secret
// (encrypted in the DB) verifies the signature — no shared env secret.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await ctx.params;
  const rawBody = await req.text(); // must read raw bytes before JSON parse
  const signature = req.headers.get("x-line-signature");

  const db = createDbClient();
  // Levels 2 (RAG) and 3 (Gemini) are enabled only when a key is configured;
  // otherwise the router runs L1 rules and falls back to handoff (risk #6).
  const routerHandlers = hasGeminiApiKey()
    ? {
        knowledgeSearch: createKnowledgeSearchHandler(db),
        aiReason: createAiReasonHandler(db),
      }
    : {};
  // Ack immediately, then process (route -> Gemini -> reply) in the background
  // so a slow AI call never makes LINE time out and redeliver the event.
  after(async () => {
    try {
      await processLineWebhook(db, channelId, rawBody, signature, {
        routerHandlers,
      });
    } catch (err) {
      console.error("LINE webhook processing failed:", err);
    }
  });
  return Response.json({ ok: true });
}
