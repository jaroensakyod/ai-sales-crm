import type { DbClient } from "@/db/client";
import { getSubscription } from "@/db/repositories/subscriptions";
import { isAuthEnabled } from "@/features/auth/session";

import { planEntitlements, type Entitlements, type Plan } from "./plans";

/**
 * Resolve a tenant's entitlements from its subscription (FREE if none yet).
 * In single-tenant / demo mode (AUTH_ENABLED off) there's no billing, so the
 * one operator gets everything — plan gating only matters for the multi-tenant
 * SaaS where AUTH_ENABLED is on.
 */
export async function getEntitlements(
  db: DbClient,
  tenantId: string,
): Promise<Entitlements> {
  if (!isAuthEnabled()) return planEntitlements("BUSINESS");
  const sub = await getSubscription(db, tenantId);
  return planEntitlements((sub?.plan as Plan) ?? "FREE");
}
