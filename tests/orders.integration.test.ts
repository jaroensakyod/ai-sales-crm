import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import {
  addOrderItem,
  applyDiscount,
  confirmPayment,
  createOrder,
  createPayment,
  getOrder,
} from "@/db/repositories/orders";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { products, tenantAiSettings } from "@/db/schema";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("orders (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let customerId: string;
  let lipId: string;
  let brushId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Order Store",
      slug: `order-${suffix}`,
    });
    tenantId = tenant.id;
    await db
      .insert(tenantAiSettings)
      .values({ tenantId, discountAuthority: "100" });

    const rows = await db
      .insert(products)
      .values([
        {
          tenantId,
          sku: `LIP-${suffix}`,
          name: "ลิปสติกสีแดง",
          price: "390",
          stock: 50,
        },
        {
          tenantId,
          sku: `BRUSH-${suffix}`,
          name: "บรัชออน",
          price: "290",
          stock: 30,
        },
      ])
      .returning();
    lipId = rows[0].id;
    brushId = rows[1].id;

    const customer = await createCustomer(db, tenantId, { displayName: "Buyer" });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("totals from DB prices (AI can't set price — risk #5)", async () => {
    const order = await createOrder(db, tenantId, { customerId });
    await addOrderItem(db, tenantId, order.id, { productId: lipId, quantity: 2 });
    await addOrderItem(db, tenantId, order.id, { productId: brushId, quantity: 1 });

    const result = await getOrder(db, tenantId, order.id);
    expect(result?.items).toHaveLength(2);
    // 2*390 + 1*290 = 1070
    expect(Number(result?.order.subtotal)).toBe(1070);
    expect(Number(result?.order.total)).toBe(1070);
  });

  it("rejects a discount over authority, accepts within (risk #5)", async () => {
    const order = await createOrder(db, tenantId, { customerId });
    await addOrderItem(db, tenantId, order.id, { productId: lipId, quantity: 1 });

    const tooBig = await applyDiscount(db, tenantId, order.id, 200); // authority 100
    expect(tooBig.ok).toBe(false);

    const ok = await applyDiscount(db, tenantId, order.id, 50);
    expect(ok.ok).toBe(true);
    const result = await getOrder(db, tenantId, order.id);
    expect(Number(result?.order.total)).toBe(340); // 390 - 50
  });

  it("only reaches PAID via a confirmed payment (risk #9)", async () => {
    const order = await createOrder(db, tenantId, { customerId });
    await addOrderItem(db, tenantId, order.id, { productId: brushId, quantity: 1 }); // 290

    const payment = await createPayment(db, tenantId, order.id, { amount: 290 });
    // Still not paid until confirmed.
    let result = await getOrder(db, tenantId, order.id);
    expect(result?.order.status).toBe("PENDING_PAYMENT");

    const { orderPaid } = await confirmPayment(db, tenantId, payment.id);
    expect(orderPaid).toBe(true);
    result = await getOrder(db, tenantId, order.id);
    expect(result?.order.status).toBe("PAID");
  });

  it("does not mark PAID when the payment underpays", async () => {
    const order = await createOrder(db, tenantId, { customerId });
    await addOrderItem(db, tenantId, order.id, { productId: lipId, quantity: 1 }); // 390

    const payment = await createPayment(db, tenantId, order.id, { amount: 100 });
    const { orderPaid } = await confirmPayment(db, tenantId, payment.id);
    expect(orderPaid).toBe(false);
    const result = await getOrder(db, tenantId, order.id);
    expect(result?.order.status).toBe("PENDING_PAYMENT");
  });
});
