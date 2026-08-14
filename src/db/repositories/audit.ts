import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { auditLogs } from "@/db/schema";

/** Append an audit entry for a sensitive action (risk #5 — trail for
 *  discounts, order-status/payment changes, role/password/plan changes). */
export async function recordAudit(
  db: DbClient,
  tenantId: string,
  input: {
    actorUserId?: string;
    action: string;
    entity?: string;
    entityId?: string;
    data?: unknown;
    ip?: string;
  },
) {
  await db.insert(auditLogs).values({
    tenantId,
    actorUserId: input.actorUserId || null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    data: input.data,
    ip: input.ip,
  });
}

export async function listAuditLogs(
  db: DbClient,
  tenantId: string,
  limit = 100,
) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.tenantId, tenantId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
