import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { customerMemories } from "@/db/schema";

export async function getMemory(
  db: DbClient,
  tenantId: string,
  customerId: string,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ value: customerMemories.value })
    .from(customerMemories)
    .where(
      and(
        eq(customerMemories.tenantId, tenantId),
        eq(customerMemories.customerId, customerId),
        eq(customerMemories.key, key),
      ),
    );
  return row?.value ?? null;
}

export async function setMemory(
  db: DbClient,
  tenantId: string,
  customerId: string,
  key: string,
  value: string,
  source = "system",
): Promise<void> {
  await db
    .insert(customerMemories)
    .values({ tenantId, customerId, key, value, source })
    .onConflictDoUpdate({
      target: [
        customerMemories.tenantId,
        customerMemories.customerId,
        customerMemories.key,
      ],
      set: { value, updatedAt: new Date() },
    });
}
