import { integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { tenantId } from "./tenants";

/** Per-store payout/bank details used to generate the "แจ้งโอน" message. */
export const paymentSettings = pgTable(
  "payment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    shopName: text("shop_name"),
    bankName: text("bank_name"),
    bankAccountNo: text("bank_account_no"),
    bankAccountName: text("bank_account_name"),
    promptpayId: text("promptpay_id"),
    shippingNote: text("shipping_note"), // e.g. "Flash Express / ไปรษณีย์ EMS"
    paymentWindowHours: integer("payment_window_hours").notNull().default(12),
    instructionExtra: text("instruction_extra"),
    ...timestamps,
  },
  (t) => [unique("payment_settings_tenant_uq").on(t.tenantId)],
);
