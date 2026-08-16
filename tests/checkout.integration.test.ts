import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { upsertPaymentSettings } from "@/db/repositories/payment-settings";
import { channels, orderItems, orders, payments, products } from "@/db/schema";
import {
  handleInboundImage,
  handleInboundText,
} from "@/features/messaging/pipeline";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("chat checkout (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const sent: string[] = [];
  const send = async (_to: string, text: string) => {
    sent.push(text);
  };

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Checkout Store",
      slug: `checkout-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@co-${suffix}`,
      })
      .returning();
    channelId = channel.id;
    await db.insert(products).values({
      tenantId,
      sku: `LIP-${suffix}`,
      name: "ลิปสติกสีแดง Matte",
      price: "390",
      stock: 50,
      currency: "THB",
    });
    await upsertPaymentSettings(db, tenantId, {
      shopName: "ร้านทดสอบ",
      bankName: "กสิกร",
      bankAccountNo: "123-4-56789-0",
      bankAccountName: "ทดสอบ ระบบ",
      paymentWindowHours: 12,
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("creates an order + sends payment instruction on a buy message", async () => {
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Ubuy-${suffix}`,
      text: "ขอสั่งลิปสติกสีแดง 2 ชิ้นค่ะ",
      channelMessageId: `co1-${suffix}`,
      send,
    });

    // Reply has the total (2*390=780) + bank instruction.
    expect(sent[0]).toContain("780");
    expect(sent[0]).toContain("กสิกร");
    expect(sent[0]).toContain("แจ้งสลิป");

    // Order persisted, PENDING_PAYMENT (not PAID — risk #9), with 1 line x2.
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(Number(order.total)).toBe(780);
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
  });

  it("a price question does NOT create an order", async () => {
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Uask-${suffix}`,
      text: "ลิปสติกสีแดงราคาเท่าไหร่คะ",
      channelMessageId: `co2-${suffix}`,
      send,
    });
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    expect(rows).toHaveLength(1); // still just the one from the buy test
  });

  it("a cancellation message does NOT create an order (C1)", async () => {
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Ucancel-${suffix}`,
      text: "ขอยกเลิกคำสั่งซื้อลิปสติกค่ะ",
      channelMessageId: `co3-${suffix}`,
      send,
    });
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    expect(rows).toHaveLength(1); // unchanged — routed to handoff, not checkout
  });

  it("a repeated buy reuses the open order (C3, no duplicate)", async () => {
    sent.length = 0;
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Ubuy-${suffix}`, // same customer as the first buy
      text: "ขอสั่งลิปสติกสีแดงอีกครั้งค่ะ",
      channelMessageId: `co4-${suffix}`,
      send,
    });
    expect(sent[0]).toContain("ออเดอร์เดิม");
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.tenantId, tenantId));
    expect(rows).toHaveLength(1); // still one order, reused
  });

  it("a slip image is acknowledged + logged as PENDING (never auto-PAID, risk #9)", async () => {
    // New customer so it gets its own conversation + order.
    const ext = `Uslip-${suffix}`;
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: ext,
      text: "ขอสั่งลิปสติกสีแดง 1 ชิ้นค่ะ",
      channelMessageId: `slipbuy-${suffix}`,
      send,
    });
    sent.length = 0;

    const res = await handleInboundImage(db, {
      tenantId,
      channelId,
      externalId: ext,
      channelMessageId: `slipimg-${suffix}`,
      slipUrl: "https://example.com/slip.jpg",
      send,
    });
    expect(res.replied).toBe(true);
    expect(sent[0]).toContain("ได้รับสลิป");

    // A PENDING payment exists; no order is flipped to PAID by a mere image.
    const pays = await db
      .select()
      .from(payments)
      .where(eq(payments.tenantId, tenantId));
    expect(pays.some((p) => p.status === "PENDING")).toBe(true);
    const paidOrders = (
      await db.select().from(orders).where(eq(orders.tenantId, tenantId))
    ).filter((o) => o.status === "PAID");
    expect(paidOrders).toHaveLength(0);
  });
});
