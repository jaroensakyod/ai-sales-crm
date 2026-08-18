import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { createFlexCard } from "@/db/repositories/flexCards";
import { channels } from "@/db/schema";
import { handleInboundText } from "@/features/messaging/pipeline";
import type { MessageCard } from "@/features/messaging/cards";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("flex card chat trigger (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Flex Store",
      slug: `flex-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({ tenantId, type: "LINE", displayName: "OA", externalId: `@fx-${suffix}` })
      .returning();
    channelId = channel.id;
    await createFlexCard(db, tenantId, {
      name: "โปรเดือนนี้",
      kind: "single",
      style: "promo",
      headline: "ลด 20% เฉพาะเดือนนี้",
      priceLabel: "เพียง 1,790 บาท",
      buttonLabel: "สั่งซื้อเลย",
      buttonKind: "message",
      buttonValue: "สั่งซื้ออีบุ๊ก",
      triggerKeyword: "โปรพิเศษ",
    });
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("sends the matching card via sendCard when the keyword appears", async () => {
    const cards: MessageCard[] = [];
    const texts: string[] = [];
    const res = await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Ufx-${suffix}`,
      text: "ขอดูโปรพิเศษหน่อยค่ะ",
      channelMessageId: `fx1-${suffix}`,
      send: async (_to, t) => {
        texts.push(t);
      },
      sendCard: async (_to, c) => {
        cards.push(c);
      },
    });
    expect(res.replied).toBe(true);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("custom_flex");
    expect(texts).toHaveLength(0); // card path, not text
  });

  it("falls back to text when the channel has no card support", async () => {
    const texts: string[] = [];
    await handleInboundText(db, {
      tenantId,
      channelId,
      externalId: `Ufx2-${suffix}`,
      text: "มีโปรพิเศษไหม",
      channelMessageId: `fx2-${suffix}`,
      send: async (_to, t) => {
        texts.push(t);
      },
      // no sendCard → text fallback
    });
    expect(texts[0]).toContain("ลด 20%");
  });
});
