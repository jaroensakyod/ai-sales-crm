import { and, eq } from "drizzle-orm";

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
      .returning();

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
