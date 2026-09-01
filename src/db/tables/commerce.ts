import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { conversations, customers } from "./customers";
import { tenantId } from "./tenants";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    sku: text("sku"),
    name: text("name").notNull(),
    description: text("description"),
    // Deep per-product knowledge the AI reads to answer questions, kept SEPARATE
    // from `description` so it never bloats the Flex card (cards show `description`
    // only; the AI catalog also feeds this in). Sent as its own bubble on request.
    aiKnowledge: text("ai_knowledge"),
    // AI never invents price/stock — it reads these live from the DB (docs/02-plan.md).
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("THB"),
    stock: integer("stock"),
    imageUrl: text("image_url"), // public HTTPS image (JPEG/PNG) the bot can send
    // Digital goods (e-book/PDF/course link) — no physical shipping, so the bot
    // must not append a delivery/EMS note on an order that's all-digital.
    isDigital: boolean("is_digital").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    attributes: jsonb("attributes"),
    ...timestamps,
  },
  (t) => [
    unique("products_tenant_sku_uq").on(t.tenantId, t.sku),
    index("products_tenant_idx").on(t.tenantId),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    price: numeric("price", { precision: 12, scale: 2 }),
    stock: integer("stock"),
    // Per-variant digital flag — e.g. a book's "PDF" version ships nothing while
    // its "รูปเล่ม" version does. Overrides the product-level flag for this variant.
    isDigital: boolean("is_digital").notNull().default(false),
    attributes: jsonb("attributes"),
    ...timestamps,
  },
  (t) => [index("variants_product_idx").on(t.tenantId, t.productId)],
);

/** Curated "goes well with" pairs — cross-sell comes from here, not AI guesses. */
export const crossSells = pgTable(
  "cross_sells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    suggestedProductId: uuid("suggested_product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    reason: text("reason"),
    weight: integer("weight").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("cross_sells_pair_uq").on(
      t.tenantId,
      t.productId,
      t.suggestedProductId,
    ),
    index("cross_sells_product_idx").on(t.tenantId, t.productId),
  ],
);

export const promotionTypeEnum = pgEnum("promotion_type", ["PERCENT", "FIXED"]);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    code: text("code"),
    type: promotionTypeEnum("type").notNull(),
    value: numeric("value", { precision: 12, scale: 2 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("promotions_tenant_idx").on(t.tenantId)],
);

export const orderStatusEnum = pgEnum("order_status", [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAID",
  "FULFILLED",
  "CANCELLED",
  "REFUNDED",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    status: orderStatusEnum("status").notNull().default("DRAFT"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    discount: numeric("discount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("THB"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("orders_tenant_status_idx").on(t.tenantId, t.status),
    index("orders_tenant_customer_idx").on(t.tenantId, t.customerId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [index("order_items_order_idx").on(t.tenantId, t.orderId)],
);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "CONFIRMED",
  "FAILED",
  "REFUNDED",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "PROMPTPAY",
  "CARD",
  "BANK_TRANSFER",
  "COD",
  "OTHER",
]);

/**
 * Payment proof. An order only moves to PAID after CONFIRMED here — verified by
 * slip/PromptPay callback, never by the AI saying so (risk #9, risk #5).
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: tenantId(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    method: paymentMethodEnum("method").notNull().default("PROMPTPAY"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("THB"),
    providerRef: text("provider_ref"),
    slipUrl: text("slip_url"),
    // Our own slip OCR (not a bank API): the amount read off the slip image, and
    // how it compares to the order total. Advisory only — the merchant still
    // confirms manually (risk #9); we never flip an order to PAID from OCR.
    verifiedAmount: numeric("verified_amount", { precision: 12, scale: 2 }),
    verifyStatus: text("verify_status").default("UNVERIFIED"),
    slipData: jsonb("slip_data"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("payments_order_idx").on(t.tenantId, t.orderId)],
);
