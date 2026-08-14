import { eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { paymentSettings } from "@/db/schema";

export async function getPaymentSettings(db: DbClient, tenantId: string) {
  const [row] = await db
    .select()
    .from(paymentSettings)
    .where(eq(paymentSettings.tenantId, tenantId));
  return row ?? null;
}

export async function upsertPaymentSettings(
  db: DbClient,
  tenantId: string,
  input: {
    shopName?: string | null;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankAccountName?: string | null;
    promptpayId?: string | null;
    shippingNote?: string | null;
    paymentWindowHours?: number;
    instructionExtra?: string | null;
  },
) {
  await db
    .insert(paymentSettings)
    .values({ tenantId, ...input })
    .onConflictDoUpdate({
      target: paymentSettings.tenantId,
      set: { ...input, updatedAt: new Date() },
    });
}
