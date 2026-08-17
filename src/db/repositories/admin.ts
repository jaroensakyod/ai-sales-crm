import { desc, eq, gte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { aiRuns, owners, subscriptions, tenants } from "@/db/schema";

/** Monthly AI-message quota per plan (drives the "used / left" view). */
export const PLAN_QUOTA: Record<string, { label: string; quota: number }> = {
  FREE: { label: "ทดลอง / ฟรี", quota: 500 },
  STARTER: { label: "เริ่มต้น ฿290", quota: 2000 },
  PRO: { label: "มาตรฐาน ฿590", quota: 6000 },
  BUSINESS: { label: "ธุรกิจ/โรงแรม ฿990", quota: 15000 },
};

function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type AdminRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  businessTypes: string[];
  createdAt: Date;
  ownerName: string | null;
  ownerProvider: string | null;
  plan: string;
  used: number;
  quota: number;
  spendUsd: number;
};

/** Every store with its owner, plan, and this-month AI usage — for /admin. */
export async function adminOverview(db: DbClient): Promise<AdminRow[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      businessTypes: tenants.businessTypes,
      createdAt: tenants.createdAt,
      ownerName: owners.displayName,
      ownerProvider: owners.provider,
      plan: subscriptions.plan,
    })
    .from(tenants)
    .leftJoin(owners, eq(tenants.ownerId, owners.id))
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .orderBy(desc(tenants.createdAt));

  const usage = await db
    .select({
      tenantId: aiRuns.tenantId,
      msgs: sql<number>`count(*)::int`,
      spend: sql<number>`coalesce(sum(${aiRuns.costUsd}), 0)::float`,
    })
    .from(aiRuns)
    .where(gte(aiRuns.createdAt, monthStartUtc()))
    .groupBy(aiRuns.tenantId);
  const byTenant = new Map(usage.map((u) => [u.tenantId, u]));

  return rows.map((r) => {
    const plan = r.plan ?? "FREE";
    const u = byTenant.get(r.id);
    return {
      ...r,
      plan,
      used: u?.msgs ?? 0,
      quota: PLAN_QUOTA[plan]?.quota ?? 0,
      spendUsd: u?.spend ?? 0,
    };
  });
}
