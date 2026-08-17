import { and, desc, eq, gte, ne } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { conversations, messages } from "@/db/schema";

export async function openConversation(
  db: DbClient,
  tenantId: string,
  input: { customerId: string; channelId: string },
) {
  const [row] = await db
    .insert(conversations)
    .values({ ...input, tenantId })
    .returning();
  return row;
}

/**
 * Reuse the customer's most recent non-closed conversation on this channel,
 * or open a new one. Keeps an ongoing chat as a single thread.
 */
export async function getOrOpenConversation(
  db: DbClient,
  tenantId: string,
  customerId: string,
  channelId: string,
) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.customerId, customerId),
        eq(conversations.channelId, channelId),
        ne(conversations.status, "CLOSED"),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);
  if (existing) return existing;
  return openConversation(db, tenantId, { customerId, channelId });
}

/**
 * Record an inbound customer message AND stamp conversations.lastInboundAt in
 * one transaction. lastInboundAt is what the Follow-up Engine reads to decide
 * whether the Meta 24-hour window is open (risk #1) — so it must never drift
 * from the actual messages.
 */
export async function recordInboundMessage(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  input: { body?: string; channelMessageId?: string; at?: Date },
) {
  const at = input.at ?? new Date();
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        tenantId,
        conversationId,
        direction: "INBOUND",
        category: "CONVERSATIONAL",
        body: input.body,
        channelMessageId: input.channelMessageId,
        sentAt: at,
      })
      // Idempotent: LINE/Meta may redeliver the same event. A duplicate
      // channelMessageId hits the unique index and inserts nothing.
      .onConflictDoNothing({
        target: [messages.tenantId, messages.channelMessageId],
      })
      .returning();

    // Duplicate delivery — already processed, don't touch the window.
    if (!message) return null;

    await tx
      .update(conversations)
      .set({ lastInboundAt: at, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.id, conversationId),
        ),
      );

    return message;
  });
}

/** Record an outbound reply and stamp lastOutboundAt (for analytics + threading). */
export async function recordOutboundMessage(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  input: {
    body: string;
    category?: (typeof messages.category.enumValues)[number];
    at?: Date;
  },
) {
  const at = input.at ?? new Date();
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        tenantId,
        conversationId,
        direction: "OUTBOUND",
        category: input.category ?? "CONVERSATIONAL",
        body: input.body,
        sentAt: at,
      })
      .returning();
    await tx
      .update(conversations)
      .set({ lastOutboundAt: at, updatedAt: new Date() })
      .where(
        and(
          eq(conversations.tenantId, tenantId),
          eq(conversations.id, conversationId),
        ),
      );
    return message;
  });
}

/**
 * Recent messages of a conversation for short-term memory, oldest→newest.
 * Feeds the AI the last few turns so it stays on-topic across a multi-message
 * chat (e.g. customer answers "บำรุง" and the bot remembers they meant the face).
 * Capped (default 8) to bound prompt size + API cost.
 */
export async function getRecentMessages(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  limit = 8,
): Promise<{ direction: "INBOUND" | "OUTBOUND"; body: string }[]> {
  const rows = await db
    .select({ direction: messages.direction, body: messages.body })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(messages.sentAt))
    .limit(limit);
  return rows
    .filter((r): r is { direction: "INBOUND" | "OUTBOUND"; body: string } =>
      Boolean(r.body),
    )
    .reverse();
}

/** How many inbound messages this conversation received since `since` — used to
 *  throttle floods (spam / abuse) before spending an AI call. */
export async function countInboundSince(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  since: Date,
): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "INBOUND"),
        gte(messages.sentAt, since),
      ),
    );
  return rows.length;
}

export async function setConversationStatus(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  status: (typeof conversations.status.enumValues)[number],
) {
  const [row] = await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.id, conversationId),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Is the Meta 24-hour messaging window currently open for this conversation?
 * True iff the customer messaged within the last 24h (risk #1). Promotional
 * follow-ups outside the window must go via LINE / FB opt-in instead.
 */
export async function isWithin24hWindow(
  db: DbClient,
  tenantId: string,
  conversationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({ lastInboundAt: conversations.lastInboundAt })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.id, conversationId),
      ),
    );
  if (!row?.lastInboundAt) return false;
  const ageMs = now.getTime() - row.lastInboundAt.getTime();
  return ageMs <= 24 * 60 * 60 * 1000;
}
