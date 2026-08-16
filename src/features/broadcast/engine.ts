import type { DbClient } from "@/db/client";
import { getConnectedLineChannel } from "@/db/repositories/line";
import { getDueBroadcasts, markBroadcast } from "@/db/repositories/broadcasts";
import { recordUsageEvent } from "@/db/repositories/ai";
import { broadcastPromo, createLineClient } from "@/features/line/client";
import { decryptSecret } from "@/lib/crypto";

export type BroadcastRunResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** How a due broadcast is actually delivered (injectable for tests). */
export type BroadcastSendFn = (args: {
  accessToken: string;
  text?: string | null;
  imageUrl?: string | null;
}) => Promise<void>;

async function defaultSend(args: {
  accessToken: string;
  text?: string | null;
  imageUrl?: string | null;
}): Promise<void> {
  await broadcastPromo(createLineClient(args.accessToken), {
    text: args.text ?? undefined,
    imageUrl: args.imageUrl,
  });
}

/**
 * Fire every scheduled broadcast whose time has come. Called by the cron route.
 * Each tenant's LINE OA token is resolved + decrypted at send time; a tenant
 * that disconnected LINE is skipped (not failed). Marks each row SENT/FAILED so
 * a redelivered cron never double-sends (only SCHEDULED rows are picked up).
 */
export async function processDueBroadcasts(
  db: DbClient,
  deps: { now?: Date; send?: BroadcastSendFn; limit?: number } = {},
): Promise<BroadcastRunResult> {
  const now = deps.now ?? new Date();
  const send = deps.send ?? defaultSend;
  const due = await getDueBroadcasts(db, now, deps.limit ?? 20);

  const result: BroadcastRunResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const b of due) {
    result.processed++;
    const line = await getConnectedLineChannel(db, b.tenantId);
    if (!line) {
      await markBroadcast(db, b.id, "SKIPPED", { error: "line_not_connected" });
      result.skipped++;
      continue;
    }
    try {
      const accessToken = decryptSecret(line.connection.accessTokenEncrypted);
      await send({ accessToken, text: b.text, imageUrl: b.imageUrl });
      await markBroadcast(db, b.id, "SENT", { sentAt: now });
      await recordUsageEvent(db, b.tenantId, {
        type: "line_broadcast",
        meta: { scheduled: true, hasImage: Boolean(b.imageUrl) },
      });
      result.sent++;
    } catch (err) {
      await markBroadcast(db, b.id, "FAILED", {
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
    }
  }
  return result;
}
