import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels, customers, products } from "@/db/schema";
import { CONSENT_PROMPT } from "@/features/consent/service";
import { handleInboundText } from "@/features/messaging/pipeline";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("consent opt-in flow (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userId = `Uconsent-${suffix}`;
  const sent: string[] = [];
  const send = async (_to: string, text: string) => {
    sent.push(text);
  };

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Consent Store",
      slug: `consent-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId,
        type: "LINE",
        displayName: "OA",
        externalId: `@consent-${suffix}`,
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
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  async function inbound(text: string, id: string) {
    return handleInboundText(db, {
      tenantId,
      channelId,
      externalId: userId,
      text,
      channelMessageId: id,
      send,
    });
  }

  it("appends the consent prompt to the first reply", async () => {
    await inbound("ลิปสติกสีแดง ราคาเท่าไหร่", `c1-${suffix}`);
    expect(sent[0]).toContain("390"); // still answers the question
    expect(sent[0]).toContain(CONSENT_PROMPT);
  });

  it("captures acceptance and grants consent", async () => {
    await inbound("ยินยอมค่ะ", `c2-${suffix}`);
    expect(sent[1]).toContain("ขอบคุณ");

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, tenantId));
    expect(customer.profilingConsent).toBe(true);
  });

  it("does not prompt again once decided", async () => {
    await inbound("ลิปสติกสีแดง มีของไหม", `c3-${suffix}`);
    expect(sent[2]).toContain("คงเหลือ");
    expect(sent[2]).not.toContain(CONSENT_PROMPT);
  });
});
