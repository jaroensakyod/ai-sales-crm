import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { channels, lineConnections } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";

/**
 * Resolve a LINE channel plus its (encrypted) connection for webhook handling.
 * Returns null if the channelId isn't a LINE channel for any tenant.
 */
export async function getLineChannelContext(db: DbClient, channelId: string) {
  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.type, "LINE")));
  if (!channel) return null;

  const [connection] = await db
    .select()
    .from(lineConnections)
    .where(eq(lineConnections.channelId, channelId));

  return { channel, connection: connection ?? null };
}

/** Store an OA's secret + access token encrypted at rest (risk #7). */
export async function upsertLineConnection(
  db: DbClient,
  tenantId: string,
  channelId: string,
  input: { channelSecret: string; accessToken: string; basicId?: string },
) {
  const [row] = await db
    .insert(lineConnections)
    .values({
      tenantId,
      channelId,
      basicId: input.basicId,
      channelSecretEncrypted: encryptSecret(input.channelSecret),
      accessTokenEncrypted: encryptSecret(input.accessToken),
      status: "CONNECTED",
    })
    .onConflictDoNothing({ target: lineConnections.channelId })
    .returning();
  return row ?? null;
}
