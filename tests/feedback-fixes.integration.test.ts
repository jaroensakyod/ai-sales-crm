import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient, type DbClient } from "@/db/client";
import { createTenant, deleteTenant } from "@/db/repositories/tenants";
import { upsertLineConnection } from "@/db/repositories/line";
import { upsertPaymentSettings } from "@/db/repositories/payment-settings";
import { createReview } from "@/db/repositories/reviews";
import { createQuickReply } from "@/db/repositories/quickReplies";
import { channels, products } from "@/db/schema";
import { computeLineSignature } from "@/features/line/signature";
import type { LineClient } from "@/features/line/client";
import { processLineWebhook } from "@/features/line/webhook";

const hasDb = !!process.env.DATABASE_URL;
const SECRET = "feedback-secret";

/** Collects every message the pipeline delivers, whether via the single-use reply
 *  token (client.replyMessage) or a follow-up push (client.pushMessage). This is
 *  exactly what the buffered LINE transport produces. */
function makeFakeClient() {
  const replyMsgs: unknown[][] = [];
  const pushMsgs: unknown[][] = [];
  const client = {
    replyMessage: async (req: { messages: unknown[] }) => {
      replyMsgs.push(req.messages);
    },
    pushMessage: async (req: { messages: unknown[] }) => {
      pushMsgs.push(req.messages);
    },
    broadcast: async () => {},
    getProfile: async () => ({ displayName: "Tester" }),
  } as unknown as LineClient;
  return { client, replyMsgs, pushMsgs };
}

type AnyMsg = { type?: string; text?: string; altText?: string };
const allText = (batches: unknown[][]) =>
  batches
    .flat()
    .map((m) => {
      const x = m as AnyMsg;
      return x.type === "text" ? (x.text ?? "") : x.type === "flex" ? (x.altText ?? "") : "";
    })
    .join("\n");
const hasFlex = (batches: unknown[][]) =>
  batches.flat().some((m) => (m as AnyMsg).type === "flex");
const hasImage = (batches: unknown[][]) =>
  batches.flat().some((m) => (m as AnyMsg).type === "image");

describe.skipIf(!hasDb)("feedback fixes (integration)", () => {
  let db: DbClient;
  let tenantId: string;
  let channelId: string;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let n = 0;

  /** Send one text message from a given LINE user and return captured messages. */
  async function post(text: string, userId: string) {
    const { client, replyMsgs, pushMsgs } = makeFakeClient();
    const body = JSON.stringify({
      events: [
        {
          type: "message",
          timestamp: Date.now(),
          replyToken: `rt-${suffix}-${n++}`,
          source: { type: "user", userId },
          message: { type: "text", id: `m-${suffix}-${n++}`, text },
        },
      ],
    });
    const sig = computeLineSignature(SECRET, body);
    const res = await processLineWebhook(db, channelId, body, sig, { client });
    return { res, replyMsgs, pushMsgs };
  }

  beforeAll(async () => {
    db = createDbClient();
    const tenant = await createTenant(db, {
      name: "Feedback Store",
      slug: `fb-${suffix}`,
    });
    tenantId = tenant.id;
    const [channel] = await db
      .insert(channels)
      .values({ tenantId, type: "LINE", displayName: "OA", externalId: `@fb-${suffix}` })
      .returning();
    channelId = channel.id;
    await upsertLineConnection(db, tenantId, channelId, {
      channelSecret: SECRET,
      accessToken: "unused",
    });
    await upsertPaymentSettings(db, tenantId, {
      shopName: "Feedback Store",
      bankName: "KBank",
      bankAccountNo: "111-2-33333-4",
      shippingNote: "EMS ส่งฟรีทั่วไทย",
    });
    // Physical products for the cart flow.
    await db.insert(products).values([
      { tenantId, name: "หนังสือทดสอบ", price: "100", stock: 50, currency: "THB" },
      { tenantId, name: "สมุดทดสอบ", price: "50", stock: 50, currency: "THB" },
      // Digital product (no shipping).
      { tenantId, name: "อีบุ๊คทดสอบ", price: "300", currency: "THB", isDigital: true },
      // Product linked from a quick reply.
      { tenantId, name: "โทนเนอร์ทดสอบ", price: "390", stock: 10, currency: "THB" },
    ]);
  });

  afterAll(async () => {
    if (tenantId) await deleteTenant(db, tenantId);
    await createDbSqlClient().end();
  });

  it("#1 reviews: sends the testimonial text (not just an empty carousel)", async () => {
    await createReview(db, tenantId, {
      imageUrl: "https://drive.google.com/file/d/AAA111/view",
      caption: "ดีมากกกก ประทับใจสุด ๆ",
      authorName: "คุณเอ",
    });
    await createReview(db, tenantId, {
      imageUrl: "https://cdn.example.com/r2.jpg",
      caption: "คุ้มค่ามาก แนะนำเลย",
      authorName: "คุณบี",
    });
    const { replyMsgs, pushMsgs } = await post("มีรีวิวไหมคะ", `Urev-${suffix}`);
    const text = allText(replyMsgs) + "\n" + allText(pushMsgs);
    // Customer actually receives the testimonial content...
    expect(text).toContain("ดีมากกกก ประทับใจสุด ๆ");
    // ...plus the review carousel card.
    expect(hasFlex(replyMsgs) || hasFlex(pushMsgs)).toBe(true);
  });

  it("#4/#9 quick reply: also delivers the linked product card, not only text", async () => {
    const rows = await db.select().from(products).where(eq(products.tenantId, tenantId));
    const tonerRow = rows.find((r) => r.name === "โทนเนอร์ทดสอบ")!;
    await createQuickReply(db, tenantId, {
      label: "ดูโทนเนอร์",
      reply: "โทนเนอร์ของเราขายดีมากค่ะ 😊",
      productId: tonerRow.id,
      matchType: "exact",
    });
    const { replyMsgs, pushMsgs } = await post("ดูโทนเนอร์", `Uqr-${suffix}`);
    const text = allText(replyMsgs) + "\n" + allText(pushMsgs);
    expect(text).toContain("โทนเนอร์ของเราขายดีมากค่ะ");
    // The product card is delivered (via push, since the text spent the reply token).
    expect(hasFlex(pushMsgs) || hasFlex(replyMsgs)).toBe(true);
  });

  it("#6 cart: a 2nd item adds to the order and the total updates on confirm", async () => {
    const user = `Ucart-${suffix}`;
    const r1 = await post("สั่งซื้อ หนังสือทดสอบ", user);
    expect(allText(r1.replyMsgs)).toContain("100");

    const r2 = await post("สั่งซื้อ สมุดทดสอบ", user);
    // 100 + 50 = 150 running total after adding the 2nd item.
    expect(allText(r2.replyMsgs)).toContain("150");

    const r3 = await post("ยืนยันสั่งซื้อ", user);
    // The payment instruction on confirm reflects the combined total, not 100.
    expect(allText(r3.replyMsgs)).toContain("150");
  });

  it("#5 digital product: confirm has no shipping/EMS note", async () => {
    const user = `Udig-${suffix}`;
    await post("สั่งซื้อ อีบุ๊คทดสอบ", user);
    const r = await post("ยืนยันสั่งซื้อ", user);
    const text = allText(r.replyMsgs);
    expect(text).toContain("300");
    expect(text).not.toContain("EMS ส่งฟรีทั่วไทย");
    expect(text).not.toContain("ที่อยู่");
  });
});
