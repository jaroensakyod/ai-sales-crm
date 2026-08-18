import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import {
  isWithin24hWindow,
  recordOutboundMessage,
} from "@/db/repositories/conversations";
import {
  getDueFollowups,
  markFollowup,
} from "@/db/repositories/followups";
import { getLineChannelContext } from "@/db/repositories/line";
import { getOrderStatus } from "@/db/repositories/orders";
import { channels, customerIdentities } from "@/db/schema";
import { getEntitlements } from "@/features/billing/entitlements";
import { createLineClient, pushText } from "@/features/line/client";
import { decryptSecret } from "@/lib/crypto";

import { evaluateFollowupGate } from "./gate";

export type PushFn = (args: {
  tenantId: string;
  channelId: string;
  toExternalId: string;
  text: string;
}) => Promise<void>;

/** Maps a scheduled follow-up's reason to the merchant on/off toggle that gates
 *  it (so quota isn't spent on a follow-up type the merchant switched off). */
const REASON_TOGGLE = {
  cart_recovery: "followupCartRecovery",
  review_request: "followupReviewRequest",
  reminder: "followupReminder",
} as const;

export type FollowupRunResult = {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
};

/** Default transport: LINE push using the channel's decrypted access token. */
async function defaultPush(
  db: DbClient,
  args: { channelId: string; toExternalId: string; text: string },
): Promise<void> {
  const context = await getLineChannelContext(db, args.channelId);
  if (!context?.connection) {
    throw new Error("no LINE connection for channel");
  }
  const token = decryptSecret(context.connection.accessTokenEncrypted);
  await pushText(createLineClient(token), args.toExternalId, args.text);
}

/**
 * Process all due follow-ups. Each one passes the 24h-window gate (risk #1)
 * before sending; blocked ones are marked SKIPPED with the reason, never sent.
 * `push` is injectable so tests don't hit the network.
 */
export async function processDueFollowups(
  db: DbClient,
  deps: { now?: Date; push?: PushFn; limit?: number } = {},
): Promise<FollowupRunResult> {
  const now = deps.now ?? new Date();
  const push = deps.push ?? ((a) => defaultPush(db, a));
  const due = await getDueFollowups(db, now, deps.limit ?? 50);

  const result: FollowupRunResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  for (const f of due) {
    result.processed++;
    const text =
      f.payload && typeof f.payload === "object"
        ? (f.payload as { text?: string }).text
        : undefined;

    if (!f.channelId || !text) {
      await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
        reason: "missing_channel_or_text",
      });
      result.skipped++;
      continue;
    }

    // Merchant follow-up on/off toggles — honour one flipped off AFTER the row
    // was scheduled, so we never spend LINE quota the merchant disabled.
    const toggleKey =
      f.reason && f.reason in REASON_TOGGLE
        ? REASON_TOGGLE[f.reason as keyof typeof REASON_TOGGLE]
        : undefined;
    if (toggleKey) {
      const settings = await getTenantAiSettings(db, f.tenantId);
      if (settings && settings[toggleKey] === false) {
        await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
          reason: `followup_disabled_${f.reason}`,
        });
        result.skipped++;
        continue;
      }
    }

    // Order-tied reminders (cart recovery) are pointless once the order is paid
    // or cancelled — drop them so we never nudge someone who already paid.
    const orderId =
      f.payload && typeof f.payload === "object"
        ? (f.payload as { orderId?: string }).orderId
        : undefined;
    if (orderId) {
      const status = await getOrderStatus(db, f.tenantId, orderId);
      const open = status === "DRAFT" || status === "PENDING_PAYMENT";
      if (!open) {
        await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
          reason: "order_not_open",
        });
        result.skipped++;
        continue;
      }
    }

    const [channel] = await db
      .select()
      .from(channels)
      .where(and(eq(channels.tenantId, f.tenantId), eq(channels.id, f.channelId)));
    if (!channel) {
      await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
        reason: "channel_not_found",
      });
      result.skipped++;
      continue;
    }

    const withinWindow = f.conversationId
      ? await isWithin24hWindow(db, f.tenantId, f.conversationId, now)
      : false;
    const gate = evaluateFollowupGate({
      withinWindow,
      category: f.category,
      channelType: channel.type,
    });
    if (!gate.allowed) {
      await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
        reason: gate.reason,
        windowCheckPassed: false,
      });
      result.skipped++;
      continue;
    }

    // Automated promotional follow-up is a Pro feature; transactional order
    // updates work on any plan.
    if (f.category !== "TRANSACTIONAL") {
      const ent = await getEntitlements(db, f.tenantId);
      if (!ent.followupAutomation) {
        await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
          reason: "plan_no_followup_automation",
        });
        result.skipped++;
        continue;
      }
    }

    const [identity] = await db
      .select()
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.tenantId, f.tenantId),
          eq(customerIdentities.customerId, f.customerId),
          eq(customerIdentities.channelId, f.channelId),
        ),
      );
    if (!identity) {
      await markFollowup(db, f.tenantId, f.id, "SKIPPED", {
        reason: "no_identity_on_channel",
      });
      result.skipped++;
      continue;
    }

    try {
      await push({
        tenantId: f.tenantId,
        channelId: f.channelId,
        toExternalId: identity.externalId,
        text,
      });
      if (f.conversationId) {
        await recordOutboundMessage(db, f.tenantId, f.conversationId, {
          body: text,
          category: f.category,
        });
      }
      await markFollowup(db, f.tenantId, f.id, "SENT", {
        reason: gate.reason,
        windowCheckPassed: true,
        sentAt: now,
      });
      result.sent++;
    } catch (err) {
      await markFollowup(db, f.tenantId, f.id, "FAILED", {
        reason: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
    }
  }

  return result;
}
