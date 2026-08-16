import { after } from "next/server";

import { createDbClient } from "@/db/client";
import { createKnowledgeSearchHandler } from "@/features/ai/rag";
import { createAiReasonHandler } from "@/features/ai/sales-agent";
import { processFacebookWebhookByPage } from "@/features/facebook/webhook";
import { hasGeminiApiKey } from "@/lib/env";

// Single-app Messenger webhook: ONE platform app receives every connected page's
// events here and routes by page id (entry[].id) — the production model. The
// per-channelId route (./[channelId]) stays for the legacy one-app-per-page setup.

// Verification handshake: Meta calls GET with hub.* params on setup.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  const db = createDbClient();
  const routerHandlers = hasGeminiApiKey()
    ? {
        knowledgeSearch: createKnowledgeSearchHandler(db),
        aiReason: createAiReasonHandler(db),
      }
    : {};
  // Ack immediately (Meta expects a fast 200), then process in the background.
  after(async () => {
    try {
      await processFacebookWebhookByPage(db, rawBody, signature, {
        routerHandlers,
      });
    } catch (err) {
      console.error("Facebook (multi-page) webhook processing failed:", err);
    }
  });
  return Response.json({ ok: true });
}
