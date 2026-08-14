import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { getProduct, getVariant } from "@/db/repositories/products";
import { customers, orderItems, orders, payments } from "@/db/schema";

export async function listOrders(db: DbClient, tenantId: string) {
  return db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.total,
      currency: orders.currency,
      createdAt: orders.createdAt,
      customerName: customers.displayName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt));
}

export async function getOrderDetail(
  db: DbClient,
  tenantId: string,
  orderId: string,
) {
  const base = await getOrder(db, tenantId, orderId);
  if (!base) return null;
  const [customer] = await db
    .select({ name: customers.displayName })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        eq(customers.id, base.order.customerId),
      ),
    );
  const pays = await db
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.orderId, orderId)));
  return { ...base, customerName: customer?.name ?? null, payments: pays };
}

export async function updateOrderStatus(
  db: DbClient,
  tenantId: string,
  orderId: string,
  status: (typeof orders.status.enumValues)[number],
) {
  await db
    .update(orders)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export async function createOrder(
  db: DbClient,
  tenantId: string,
  input: { customerId: string; conversationId?: string; note?: string },
) {
  const [row] = await db
    .insert(orders)
    .values({ tenantId, ...input })
    .returning();
  return row;
}

export async function getOrder(db: DbClient, tenantId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
  if (!order) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, orderId)));
  return { order, items };
}

/**
 * Add a line item. The unit price is ALWAYS read from the DB product/variant —
 * never passed in — so the AI can suggest items but can't invent prices
 * (risk #5). Snapshots the name + price onto the item for an immutable record.
 */
export async function addOrderItem(
  db: DbClient,
  tenantId: string,
  orderId: string,
  input: { productId?: string; variantId?: string; quantity?: number },
) {
  const quantity = input.quantity ?? 1;
  if (quantity <= 0) throw new Error("quantity must be positive");

  let unitPrice: string;
  let name: string;
  let productId: string | undefined = input.productId;

  if (input.variantId) {
    const variant = await getVariant(db, tenantId, input.variantId);
    if (!variant) throw new Error("variant not found");
    productId = variant.productId;
    const product = await getProduct(db, tenantId, variant.productId);
    unitPrice = variant.price ?? product?.price ?? "0";
    name = `${product?.name ?? "สินค้า"} (${variant.name})`;
  } else if (input.productId) {
    const product = await getProduct(db, tenantId, input.productId);
    if (!product) throw new Error("product not found");
    unitPrice = product.price;
    name = product.name;
  } else {
    throw new Error("productId or variantId is required");
  }

  const lineTotal = money(Number(unitPrice) * quantity);
  const [item] = await db
    .insert(orderItems)
    .values({
      tenantId,
      orderId,
      productId,
      variantId: input.variantId,
      nameSnapshot: name,
      quantity,
      unitPrice,
      lineTotal,
    })
    .returning();

  await recalcOrderTotals(db, tenantId, orderId);
  return item;
}

/** Recompute subtotal/total from line items; total = subtotal - discount (>= 0). */
export async function recalcOrderTotals(
  db: DbClient,
  tenantId: string,
  orderId: string,
) {
  const items = await db
    .select({ lineTotal: orderItems.lineTotal })
    .from(orderItems)
    .where(and(eq(orderItems.tenantId, tenantId), eq(orderItems.orderId, orderId)));
  const subtotal = items.reduce((s, i) => s + Number(i.lineTotal), 0);

  const [order] = await db
    .select({ discount: orders.discount })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
  const discount = Number(order?.discount ?? 0);
  const total = Math.max(0, subtotal - discount);

  await db
    .update(orders)
    .set({ subtotal: money(subtotal), total: money(total), updatedAt: new Date() })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
}

/**
 * Apply a discount. Enforces the tenant's discount authority in code — the AI
 * (or an unauthorized rule) cannot exceed it (risk #5). A human can pass
 * override to go beyond, which is where an audit log entry would attach.
 */
export async function applyDiscount(
  db: DbClient,
  tenantId: string,
  orderId: string,
  amount: number,
  opts: { override?: boolean } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (amount < 0) return { ok: false, reason: "discount must be >= 0" };
  const settings = await getTenantAiSettings(db, tenantId);
  const authority = Number(settings?.discountAuthority ?? 0);
  if (!opts.override && amount > authority) {
    return {
      ok: false,
      reason: `discount ${amount} exceeds authority ${authority}`,
    };
  }
  await db
    .update(orders)
    .set({ discount: money(amount), updatedAt: new Date() })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));
  await recalcOrderTotals(db, tenantId, orderId);
  return { ok: true };
}

/** Look up a payment by id without a tenant filter — for provider webhooks
 *  (system scope). The returned tenantId scopes all downstream writes. */
export async function getPaymentAnyTenant(db: DbClient, paymentId: string) {
  const [row] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));
  return row ?? null;
}

export async function createPayment(
  db: DbClient,
  tenantId: string,
  orderId: string,
  input: {
    amount: number;
    method?: (typeof payments.method.enumValues)[number];
    slipUrl?: string;
    providerRef?: string;
  },
) {
  const [payment] = await db
    .insert(payments)
    .values({
      tenantId,
      orderId,
      amount: money(input.amount),
      method: input.method ?? "PROMPTPAY",
      slipUrl: input.slipUrl,
      providerRef: input.providerRef,
    })
    .returning();
  // Move the order into PENDING_PAYMENT once a payment attempt exists.
  await db
    .update(orders)
    .set({ status: "PENDING_PAYMENT", updatedAt: new Date() })
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.id, orderId),
        eq(orders.status, "DRAFT"),
      ),
    );
  return payment;
}

/**
 * Confirm a payment (verified slip / PromptPay callback). ONLY here does an
 * order become PAID — never on the AI's say-so (risk #9). The order flips to
 * PAID once confirmed payments cover its total.
 */
export async function confirmPayment(
  db: DbClient,
  tenantId: string,
  paymentId: string,
): Promise<{ orderPaid: boolean }> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .update(payments)
      .set({ status: "CONFIRMED", confirmedAt: new Date() })
      .where(and(eq(payments.tenantId, tenantId), eq(payments.id, paymentId)))
      .returning();
    if (!payment) throw new Error("payment not found");

    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, payment.orderId)));
    if (!order) throw new Error("order not found");

    const confirmed = await tx
      .select({ amount: payments.amount, status: payments.status })
      .from(payments)
      .where(and(eq(payments.tenantId, tenantId), eq(payments.orderId, order.id)));
    const paidSum = confirmed
      .filter((p) => p.status === "CONFIRMED")
      .reduce((s, p) => s + Number(p.amount), 0);

    const orderPaid = paidSum >= Number(order.total) && Number(order.total) > 0;
    if (orderPaid) {
      await tx
        .update(orders)
        .set({ status: "PAID", updatedAt: new Date() })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, order.id)));
    }
    return { orderPaid };
  });
}
