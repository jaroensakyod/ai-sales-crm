import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import {
  createCustomer,
  getCustomer,
  listCustomers,
} from "@/db/repositories/customers";
import {
  openConversation,
  recordInboundMessage,
  isWithin24hWindow,
} from "@/db/repositories/conversations";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { channels } from "@/db/schema";

/**
 * REAL database proof for risk #8 (tenant isolation) and risk #1 (24h window).
 * Skipped automatically when DATABASE_URL is not set (e.g. CI without secrets).
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("tenant isolation (integration)", () => {
  let db: DbClient;
  let tenantA: string;
  let tenantB: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const a = await createTenant(db, {
      name: "Store A",
      slug: `test-a-${suffix}`,
    });
    const b = await createTenant(db, {
      name: "Store B",
      slug: `test-b-${suffix}`,
    });
    tenantA = a.id;
    tenantB = b.id;
  });

  afterAll(async () => {
    // Cascade removes all child rows created below.
    if (tenantA) await deleteTenant(db, tenantA);
    if (tenantB) await deleteTenant(db, tenantB);
    await createDbSqlClient().end();
  });

  it("a customer created under A is invisible to B", async () => {
    const custA = await createCustomer(db, tenantA, { displayName: "Alice" });

    // B cannot fetch A's customer by id.
    expect(await getCustomer(db, tenantB, custA.id)).toBeNull();
    // A can.
    expect((await getCustomer(db, tenantA, custA.id))?.id).toBe(custA.id);
  });

  it("list is scoped to the asking tenant", async () => {
    await createCustomer(db, tenantA, { displayName: "A-only" });
    await createCustomer(db, tenantB, { displayName: "B-only" });

    const listA = await listCustomers(db, tenantA);
    const listB = await listCustomers(db, tenantB);

    expect(listA.every((c) => c.tenantId === tenantA)).toBe(true);
    expect(listB.every((c) => c.tenantId === tenantB)).toBe(true);
    expect(listA.some((c) => c.displayName === "B-only")).toBe(false);
    expect(listB.some((c) => c.displayName === "A-only")).toBe(false);
  });

  it("records inbound message and drives the 24h window", async () => {
    const cust = await createCustomer(db, tenantA, { displayName: "Windowed" });
    const [channel] = await db
      .insert(channels)
      .values({
        tenantId: tenantA,
        type: "LINE",
        displayName: "Test OA",
        externalId: `oa-${suffix}`,
      })
      .returning();

    const convo = await openConversation(db, tenantA, {
      customerId: cust.id,
      channelId: channel.id,
    });

    // No inbound yet → window closed.
    expect(await isWithin24hWindow(db, tenantA, convo.id)).toBe(false);

    // Inbound now → window open.
    await recordInboundMessage(db, tenantA, convo.id, { body: "สนใจสินค้า" });
    expect(await isWithin24hWindow(db, tenantA, convo.id)).toBe(true);

    // Simulate 25h later → window closed again.
    const in25h = new Date(Date.now() + 25 * 60 * 60 * 1000);
    expect(await isWithin24hWindow(db, tenantA, convo.id, in25h)).toBe(false);
  });
});
