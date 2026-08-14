import type { DbClient } from "@/db/client";
import { getFacebookChannelContext } from "@/db/repositories/facebook";
import { decryptSecret } from "@/lib/crypto";
import { handleInboundText, type SendFn } from "@/features/messaging/pipeline";
import type { RouterHandlers } from "@/features/router/types";

import { sendFacebookText } from "./client";
import { verifyFacebookSignature } from "./signature";

type FbMessaging = {
  sender?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
};
type FbEntry = { messaging?: FbMessaging[] };

export type FbProcessDeps = {
  routerHandlers?: RouterHandlers;
  /** Override the send transport (tests inject a spy instead of the Graph API). */
  send?: SendFn;
};

export type FbWebhookResult =
  | { ok: false; status: 401 | 404 | 409 | 500; error: string }
  | { ok: true; status: 200; processed: number; skipped: number; replied: number };

/**
 * Verify the app-secret signature, then run each inbound text message through
 * the shared pipeline. Messenger replies via the Send API to the sender PSID
 * (no reply token), using the page's decrypted access token.
 */
export async function processFacebookWebhook(
  db: DbClient,
  channelId: string,
  rawBody: string,
  signature: string | null | undefined,
  deps: FbProcessDeps = {},
): Promise<FbWebhookResult> {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return { ok: false, status: 500, error: "META_APP_SECRET not configured" };
  }
  if (!verifyFacebookSignature(appSecret, rawBody, signature)) {
    return { ok: false, status: 401, error: "invalid signature" };
  }

  const context = await getFacebookChannelContext(db, channelId);
  if (!context) return { ok: false, status: 404, error: "unknown channel" };
  if (!context.connection) {
    return { ok: false, status: 409, error: "channel not connected" };
  }

  let payload: { entry?: FbEntry[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 401, error: "invalid json" };
  }

  // Send transport: injected spy in tests, else the Graph API with the page token.
  let send = deps.send;
  const getSend = (): SendFn => {
    if (!send) {
      const token = decryptSecret(context.connection!.accessTokenEncrypted);
      send = (psid, text) => sendFacebookText(token, psid, text);
    }
    return send;
  };

  const tenantId = context.channel.tenantId;
  let processed = 0;
  let skipped = 0;
  let replied = 0;

  for (const entry of payload.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      const psid = m.sender?.id;
      const text = m.message?.text;
      if (!psid || !text || m.message?.is_echo) {
        skipped++;
        continue;
      }

      const result = await handleInboundText(db, {
        tenantId,
        channelId,
        externalId: psid,
        text,
        channelMessageId: m.message?.mid,
        at: m.timestamp ? new Date(m.timestamp) : undefined,
        routerHandlers: deps.routerHandlers,
        send: getSend(),
      });

      if (result.status === "duplicate") {
        skipped++;
        continue;
      }
      processed++;
      if (result.replied) replied++;
    }
  }

  return { ok: true, status: 200, processed, skipped, replied };
}
