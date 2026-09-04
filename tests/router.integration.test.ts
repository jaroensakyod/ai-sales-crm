import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createCustomer } from "@/db/repositories/customers";
import { openConversation } from "@/db/repositories/conversations";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels, conversations, products } from "@/db/schema";
import { routeMessage } from "@/features/router/router";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("message router (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let conversationId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Router Store",
      slug: `router-${suffix}`,
    });
    tenantId = tenant.id;

    await db.insert(products).values([
      {
        tenantId,
        sku: `LIP-${suffix}`,
        name: "ลิปสติกสีแดง Matte",
        price: "390",
        stock: 50,
        currency: "THB",
      },
      {
        tenantId,
        sku: `FOUND-${suffix}`,
        name: "รองพื้นเนื้อแมตต์",
        price: "550",
        stock: 0,
        currency: "THB",
      },
    ]);

    const customer = await createCustomer(db, tenantId, { displayName: "Tester" });
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@r-${suffix}`,
      })
      .returning();
    const convo = await openConversation(db, tenantId, {
      customerId: customer.id,
      channelId: channel.id,
    });
    conversationId = convo.id;
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("L1: answers price from live DB (no AI)", async () => {
    const d = await routeMessage(db, {
      tenantId,
      text: "ลิปสติกสีแดง ราคาเท่าไหร่คะ",
    });
    expect(d.level).toBe(1);
    expect(d.source).toBe("rule:price");
    expect(d.replyText).toContain("390");
  });

  it("L1: appends a cross-sell suggestion on a price question", async () => {
    const { addCrossSell } = await import("@/db/repositories/products");
    const [lip] = await db
      .select()
      .from(products)
      .where(eq(products.sku, `LIP-${suffix}`));
    const [foundation] = await db
      .select()
      .from(products)
      .where(eq(products.sku, `FOUND-${suffix}`));
    await addCrossSell(db, tenantId, lip.id, foundation.id, "แต่งหน้าครบลุค");
    const { updateTenantAiSettings } = await import("@/db/repositories/ai");
    const ask = () =>
      routeMessage(db, { tenantId, text: "ลิปสติกสีแดง ราคาเท่าไหร่คะ" });

    // Calm default (consultative) answers the price only — no upsell (merchant feedback).
    await updateTenantAiSettings(db, tenantId, { replyMode: "CONSULTATIVE" });
    expect((await ask()).replyText).not.toContain("คู่กัน");

    // Selling mode brings the hero cross-sell back.
    await updateTenantAiSettings(db, tenantId, { replyMode: "PROACTIVE" });
    const d = await ask();
    expect(d.replyText).toContain("คู่กัน");
    expect(d.replyText).toContain("รองพื้น");
  });

  it("L1: answers stock, including out-of-stock", async () => {
    const inStock = await routeMessage(db, {
      tenantId,
      text: "ลิปสติกสีแดง มีของไหม",
    });
    expect(inStock.level).toBe(1);
    expect(inStock.replyText).toContain("คงเหลือ 50");

    const out = await routeMessage(db, {
      tenantId,
      text: "รองพื้นเนื้อแมตต์ มีของไหม",
    });
    expect(out.replyText).toContain("หมดสต็อก");
  });

  it("L4: refund routes to handoff and flips the conversation", async () => {
    const d = await routeMessage(db, {
      tenantId,
      conversationId,
      text: "ขอคืนเงินด้วยค่ะ สินค้ามีปัญหา",
    });
    expect(d.level).toBe(4);
    expect(d.action).toBe("handoff");

    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(convo.status).toBe("HANDOFF");
  });

  it("L1: answers 'how do I buy/pay?' deterministically (review #4)", async () => {
    const d = await routeMessage(db, { tenantId, text: "ซื้อยังไงคะ จ่ายเงินยังไง" });
    expect(d.level).toBe(1);
    expect(d.source).toBe("rule:payment");
    expect(d.replyText).toContain("ยืนยันสั่งซื้อ");
  });

  it("L1: asks which product when price is asked with no product named (review #3)", async () => {
    const d = await routeMessage(db, { tenantId, text: "ราคาเท่าไหร่คะ" });
    expect(d.level).toBe(1);
    expect(d.source).toBe("rule:price_clarify");
    expect(d.replyText).toContain("ลิปสติกสีแดง Matte");
  });

  it("L4: a frustrated customer is escalated, never left silent (review #2)", async () => {
    const d = await routeMessage(db, {
      tenantId,
      conversationId,
      text: "ห่วยมากไม่ตอบสักที",
    });
    expect(d.level).toBe(4);
    expect(d.action).toBe("handoff");
    expect(d.replyText).toContain("ทีมงาน");
  });

  it("L2/L3: injected handlers answer when rules don't", async () => {
    const l2 = await routeMessage(
      db,
      { tenantId, text: "นโยบายการจัดส่งเป็นยังไง" },
      { knowledgeSearch: async () => "จัดส่งภายใน 2-3 วันค่ะ" },
    );
    expect(l2.level).toBe(2);
    expect(l2.source).toBe("knowledge");

    const l3 = await routeMessage(
      db,
      { tenantId, text: "ช่วยแนะนำของขวัญให้แฟนหน่อย" },
      { aiReason: async () => "แนะนำเซ็ตลิป + บรัชออนค่ะ" },
    );
    expect(l3.level).toBe(3);
    expect(l3.source).toBe("ai");
  });

  it("L4: falls back to handoff when nothing can answer", async () => {
    const d = await routeMessage(db, {
      tenantId,
      text: "อยากคุยเรื่องทั่วไปเฉยๆ",
    });
    expect(d.level).toBe(4);
    expect(d.source).toBe("fallback");
  });
});
