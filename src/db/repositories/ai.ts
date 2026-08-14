import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { aiRuns, tenantAiSettings, usageEvents } from "@/db/schema";

export async function getTenantAiSettings(db: DbClient, tenantId: string) {
  const [row] = await db
    .select()
    .from(tenantAiSettings)
    .where(eq(tenantAiSettings.tenantId, tenantId));
  return row ?? null;
}

/** Create or update a tenant's AI guardrail settings (merchant-editable). */
export async function updateTenantAiSettings(
  db: DbClient,
  tenantId: string,
  input: {
    discountAuthority?: string;
    bannedPhrases?: string[];
    systemPromptExtra?: string | null;
    softCapUsd?: string | null;
  },
) {
  await db
    .insert(tenantAiSettings)
    .values({ tenantId, ...input })
    .onConflictDoUpdate({
      target: tenantAiSettings.tenantId,
      set: { ...input, updatedAt: new Date() },
    });
}

export type AiRunInput = {
  conversationId?: string;
  model: string;
  routerLevel?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  status?: string;
  error?: string | null;
};

/** One row per Gemini call — cost/latency accounting + debugging. */
export async function recordAiRun(
  db: DbClient,
  tenantId: string,
  input: AiRunInput,
) {
  const [row] = await db
    .insert(aiRuns)
    .values({
      tenantId,
      conversationId: input.conversationId,
      model: input.model,
      routerLevel: input.routerLevel,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd?.toFixed(6),
      latencyMs: input.latencyMs,
      status: input.status ?? "ok",
      error: input.error ?? null,
    })
    .returning();
  return row;
}

export async function recordUsageEvent(
  db: DbClient,
  tenantId: string,
  input: { type: string; quantity?: number; costUsd?: number; meta?: unknown },
) {
  await db.insert(usageEvents).values({
    tenantId,
    type: input.type,
    quantity: input.quantity ?? 1,
    costUsd: input.costUsd?.toFixed(6),
    meta: input.meta,
  });
}
