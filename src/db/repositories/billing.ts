import { and, eq, gte, sql } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { aiRuns } from "@/db/schema";

/** Month-to-date AI spend (USD) for a tenant, from ai_runs. */
export async function getMonthlyAiSpend(
  db: DbClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<number> {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const [row] = await db
    .select({
      spend: sql<number>`coalesce(sum(${aiRuns.costUsd}), 0)::float`,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.tenantId, tenantId), gte(aiRuns.createdAt, monthStart)));
  return row?.spend ?? 0;
}
