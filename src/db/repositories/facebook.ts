import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { channels, facebookConnections } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";

/** Resolve a Messenger channel + its (encrypted) page connection for webhooks. */
export async function getFacebookChannelContext(
  db: DbClient,
  channelId: string,
) {
  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.type, "MESSENGER")));
  if (!channel) return null;

  const [connection] = await db
    .select()
    .from(facebookConnections)
    .where(eq(facebookConnections.channelId, channelId));

  return { channel, connection: connection ?? null };
}

/**
 * Resolve a Messenger channel + connection by Facebook page id. This is how the
 * single-app webhook routes: one platform app receives every page's events on
 * one URL and dispatches by `entry[].id` (the page id). Returns null if the page
 * isn't connected to any tenant.
 */
export async function getFacebookChannelByPageId(db: DbClient, pageId: string) {
  const [connection] = await db
    .select()
    .from(facebookConnections)
    .where(eq(facebookConnections.pageId, pageId));
  if (!connection) return null;
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, connection.channelId));
  if (!channel) return null;
  return { channel, connection };
}

/** Store a page's access token encrypted at rest (risk #7). */
export async function upsertFacebookConnection(
  db: DbClient,
  tenantId: string,
  channelId: string,
  input: { pageId: string; pageName?: string; accessToken: string },
) {
  const [row] = await db
    .insert(facebookConnections)
    .values({
      tenantId,
      channelId,
      pageId: input.pageId,
      pageName: input.pageName,
      accessTokenEncrypted: encryptSecret(input.accessToken),
      status: "CONNECTED",
    })
    .onConflictDoNothing({ target: [facebookConnections.tenantId, facebookConnections.pageId] })
    .returning();
  return row ?? null;
}
