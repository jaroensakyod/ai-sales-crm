import type { DbClient } from "@/db/client";
import { getSubscription } from "@/db/repositories/subscriptions";

import { planEntitlements, type Entitlements, type Plan } from "./plans";

/** Resolve a tenant's entitlements from its subscription (FREE if none yet). */
export async function getEntitlements(
  db: DbClient,
  tenantId: string,
): Promise<Entitlements> {
  const sub = await getSubscription(db, tenantId);
  return planEntitlements((sub?.plan as Plan) ?? "FREE");
}
