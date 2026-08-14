import type { DbClient } from "@/db/client";
import { recordAgreement } from "@/db/repositories/agreements";
import { upsertFacebookConnection } from "@/db/repositories/facebook";
import { upsertLineConnection } from "@/db/repositories/line";
import {
  channels,
  salesStages,
  tenantAiSettings,
  tenants,
} from "@/db/schema";

/** Current DPA version presented at onboarding (bump when the contract changes). */
export const DPA_VERSION = "2026-08-01";

const DEFAULT_STAGES = [
  { name: "New Lead", sortOrder: 0 },
  { name: "Contacted", sortOrder: 1 },
  { name: "Qualified", sortOrder: 2 },
  { name: "Proposal Sent", sortOrder: 3 },
  { name: "Won", sortOrder: 4, isWon: true },
  { name: "Lost", sortOrder: 5, isLost: true },
];

/**
 * Create a store: tenant + AI settings (discount authority 0) + default sales
 * pipeline, and log DPA acceptance in the same step (risk #3). Throws on a
 * duplicate slug (unique constraint).
 */
export async function createStore(
  db: DbClient,
  input: {
    name: string;
    slug: string;
    businessTypes?: (typeof tenants.businessTypes.enumValues)[number][];
    ip?: string;
    userAgent?: string;
  },
) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: input.name,
      slug: input.slug,
      status: "ACTIVE",
      businessTypes: input.businessTypes ?? [],
    })
    .returning();

  await db.insert(tenantAiSettings).values({ tenantId: tenant.id });
  await db
    .insert(salesStages)
    .values(DEFAULT_STAGES.map((s) => ({ tenantId: tenant.id, ...s })));
  await recordAgreement(db, tenant.id, {
    type: "DPA",
    version: DPA_VERSION,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return tenant;
}

export async function connectLineChannel(
  db: DbClient,
  tenantId: string,
  input: {
    displayName: string;
    basicId: string;
    channelSecret: string;
    accessToken: string;
  },
) {
  const [channel] = await db
    .insert(channels)
    .values({
      tenantId,
      type: "LINE",
      displayName: input.displayName,
      externalId: input.basicId,
    })
    .onConflictDoNothing({
      target: [channels.tenantId, channels.type, channels.externalId],
    })
    .returning();
  if (!channel) throw new Error("channel already exists for this OA");

  await upsertLineConnection(db, tenantId, channel.id, {
    channelSecret: input.channelSecret,
    accessToken: input.accessToken,
    basicId: input.basicId,
  });
  return channel;
}

export async function connectFacebookChannel(
  db: DbClient,
  tenantId: string,
  input: { displayName: string; pageId: string; accessToken: string },
) {
  const [channel] = await db
    .insert(channels)
    .values({
      tenantId,
      type: "MESSENGER",
      displayName: input.displayName,
      externalId: input.pageId,
    })
    .onConflictDoNothing({
      target: [channels.tenantId, channels.type, channels.externalId],
    })
    .returning();
  if (!channel) throw new Error("channel already exists for this page");

  await upsertFacebookConnection(db, tenantId, channel.id, {
    pageId: input.pageId,
    accessToken: input.accessToken,
  });
  return channel;
}
