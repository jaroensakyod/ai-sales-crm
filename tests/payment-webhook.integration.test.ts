import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import {
  addOrderItem,
  createOrder,
  createPayment,
  getOrder,
} from "@/db/repositories/orders";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { auditLogs, products } from "@/db/schema";
import { processPaymentWebhook } from "@/features/payment/webhook";
import { eq } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;
const SECRET = "pay-secret-123";

describe.skipIf(!hasDb)("payment webhook (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let paymentId: string;
  let orderId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Pay Store",
      slug: `pay-${suffix}`,
    });
    tenantId = tenant.id;
    const [product] = await db
      .insert(products)
      .values({ tenantId, sku: `P-${suffix}`, name: "สินค้า", price: "500" })
      .returning();
    const customer = await createCustomer(db, tenantId, { displayName: "P" });
    const order = await createOrder(db, tenantId, { customerId: customer.id });
    orderId = order.id;
    await addOrderItem(db, tenantId, orderId, { productId: product.id, quantity: 1 });
    const payment = await createPayment(db, tenantId, orderId, { amount: 500 });
    paymentId = payment.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("fails closed when no secret is configured", async () => {
    const saved = process.env.PAYMENT_WEBHOOK_SECRET;
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    const res = await processPaymentWebhook(
      db,
      JSON.stringify({ paymentId, event: "paid" }),
      "anything",
    );
    process.env.PAYMENT_WEBHOOK_SECRET = saved;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("rejects a bad secret", async () => {
    const res = await processPaymentWebhook(
      db,
      JSON.stringify({ paymentId, event: "charge.complete" }),
      "wrong",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("404 for unknown payment", async () => {
    const res = await processPaymentWebhook(
      db,
      JSON.stringify({ paymentId: "00000000-0000-0000-0000-000000000000", event: "paid" }),
      SECRET,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("confirms payment and flips the order to PAID (risk #9)", async () => {
    const res = await processPaymentWebhook(
      db,
      JSON.stringify({ paymentId, event: "charge.complete" }),
      SECRET,
    );
    expect(res.ok && res.orderPaid).toBe(true);
    const result = await getOrder(db, tenantId, orderId);
    expect(result?.order.status).toBe("PAID");

    // Audit trail written (risk #5).
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId));
    expect(logs.some((l) => l.action === "payment.confirmed")).toBe(true);
  });

  it("is idempotent on redelivery", async () => {
    const res = await processPaymentWebhook(
      db,
      JSON.stringify({ paymentId, event: "charge.complete" }),
      SECRET,
    );
    expect(res.ok && res.alreadyConfirmed).toBe(true);
  });
});
