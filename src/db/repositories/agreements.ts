import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { tenantAgreements } from "@/db/schema";

/** Log a click-to-accept agreement (PDPA/DPA/T&C) — risk #3. Immutable record. */
export async function recordAgreement(
  db: DbClient,
  tenantId: string,
  input: {
    type: (typeof tenantAgreements.type.enumValues)[number];
    version: string;
    acceptedByUserId?: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const [row] = await db
    .insert(tenantAgreements)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

export async function getLatestAgreement(
  db: DbClient,
  tenantId: string,
  type: (typeof tenantAgreements.type.enumValues)[number],
) {
  const [row] = await db
    .select()
    .from(tenantAgreements)
    .where(
      and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.type, type),
      ),
    )
    .orderBy(desc(tenantAgreements.acceptedAt))
    .limit(1);
  return row ?? null;
}

export async function hasAcceptedDpa(db: DbClient, tenantId: string) {
  return (await getLatestAgreement(db, tenantId, "DPA")) !== null;
}
