/**
 * Seed a demo tenant (our own store) with enough data to exercise the whole
 * system: users, AI settings, a sales pipeline, a LINE channel, products, and a
 * cross-sell pair matching the docs/01-summary.md use case (lipstick → brush-on).
 *
 * Idempotent: safe to run repeatedly (unique keys + onConflictDoNothing).
 *   npm run db:seed            # create/ensure demo data
 *   npm run db:seed -- --reset # wipe the demo tenant first, then reseed clean
 */
import { and, eq } from "drizzle-orm";

import { createDbClient, createDbSqlClient } from "@/db/client";
import { hashPassword } from "@/lib/password";
import {
  channels,
  crossSells,
  products,
  salesStages,
  tenantAiSettings,
  tenants,
  users,
} from "@/db/schema";

const DEMO_SLUG = "demo-store";

async function main() {
  const reset = process.argv.includes("--reset");
  const db = createDbClient();

  if (reset) {
    await db.delete(tenants).where(eq(tenants.slug, DEMO_SLUG));
    console.log(`[reset] removed existing tenant '${DEMO_SLUG}' (cascade)`);
  }

  // 1. Tenant --------------------------------------------------------------
  await db
    .insert(tenants)
    .values({
      name: "ร้านตัวอย่าง (Demo Store)",
      slug: DEMO_SLUG,
      status: "ACTIVE",
      businessTypes: ["CATALOG"],
    })
    .onConflictDoNothing({ target: tenants.slug });

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, DEMO_SLUG));
  const tenantId = tenant.id;
  console.log(`tenant: ${tenant.name} (${tenantId})`);

  // 2. Owner user ----------------------------------------------------------
  await db
    .insert(users)
    .values({
      tenantId,
      email: "owner@demo-store.local",
      name: "เจ้าของร้าน",
      role: "OWNER",
    })
    .onConflictDoNothing({ target: [users.tenantId, users.email] });

  // Set a demo password so per-tenant login works (owner@demo-store.local / demo1234).
  const [owner] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.tenantId, tenantId), eq(users.email, "owner@demo-store.local")),
    );
  if (owner && !owner.passwordHash) {
    await db
      .update(users)
      .set({ passwordHash: hashPassword("demo1234") })
      .where(eq(users.id, owner.id));
  }

  // 3. AI settings (discount authority 0 by default — risk #5) -------------
  await db
    .insert(tenantAiSettings)
    .values({ tenantId })
    .onConflictDoNothing({ target: tenantAiSettings.tenantId });

  // 4. Sales pipeline (only if this tenant has none yet) -------------------
  const existingStages = await db
    .select({ id: salesStages.id })
    .from(salesStages)
    .where(eq(salesStages.tenantId, tenantId));
  if (existingStages.length === 0) {
    await db.insert(salesStages).values([
      { tenantId, name: "New Lead", sortOrder: 0 },
      { tenantId, name: "Contacted", sortOrder: 1 },
      { tenantId, name: "Qualified", sortOrder: 2 },
      { tenantId, name: "Proposal Sent", sortOrder: 3 },
      { tenantId, name: "Won", sortOrder: 4, isWon: true },
      { tenantId, name: "Lost", sortOrder: 5, isLost: true },
    ]);
    console.log("sales pipeline: 6 stages created");
  } else {
    console.log(`sales pipeline: ${existingStages.length} stages already exist`);
  }

  // 5. LINE channel (default Phase-1 channel) -----------------------------
  await db
    .insert(channels)
    .values({
      tenantId,
      type: "LINE",
      displayName: "Demo Store LINE OA",
      externalId: "@demostore",
    })
    .onConflictDoNothing({
      target: [channels.tenantId, channels.type, channels.externalId],
    });

  // 6. Products (beauty catalog) ------------------------------------------
  // Realistic Thai beauty & personal-care range across the main Shopee
  // Beauty categories: makeup, skincare, haircare, body/bath, fragrance.
  const catalog = [
    // --- Makeup: lips ------------------------------------------------------
    {
      sku: "LIP-001",
      name: "ลิปสติกสีแดง Matte",
      description: "ลิปสติกเนื้อแมตต์ ติดทน สีแดงคลาสสิก",
      price: "390",
      stock: 50,
    },
    {
      sku: "LIP-002",
      name: "ลิปทินท์สีส้มพีช",
      description: "ลิปทินท์เนื้อบางเบา สีส้มพีช ให้ลุคปากฉ่ำธรรมชาติ",
      price: "245",
      stock: 60,
    },
    {
      sku: "LIP-003",
      name: "ลิปบาล์มบำรุงริมฝีปาก SPF15",
      description: "ลิปบาล์มผสมวิตามินอี บำรุงริมฝีปากนุ่ม กันแดด SPF15",
      price: "159",
      stock: 80,
    },
    // --- Makeup: face ------------------------------------------------------
    {
      sku: "BRUSH-01",
      name: "บรัชออนสีพีช",
      description: "บรัชออนโทนพีช เข้ากับลิปสีแดง แต่งหน้าครบลุค",
      price: "290",
      stock: 30,
    },
    {
      sku: "FOUND-01",
      name: "รองพื้นเนื้อแมตต์",
      description: "รองพื้นคุมมัน ติดทนทั้งวัน เหมาะกับผิวมัน",
      price: "550",
      stock: 20,
    },
    {
      sku: "CUSH-01",
      name: "คุชชั่นรองพื้น SPF50",
      description: "คุชชั่นเนื้อบางเบา ปกปิดเนียน กันแดด SPF50 PA+++",
      price: "620",
      stock: 25,
    },
    {
      sku: "POWD-01",
      name: "แป้งฝุ่นโปร่งแสง",
      description: "แป้งฝุ่นเนื้อละเอียด คุมมัน เซ็ตเมคอัพให้ติดทน",
      price: "320",
      stock: 40,
    },
    {
      sku: "CONC-01",
      name: "คอนซีลเลอร์ปกปิดรอยคล้ำ",
      description: "คอนซีลเลอร์เนื้อครีม ปกปิดรอยสิว รอยคล้ำใต้ตา",
      price: "280",
      stock: 45,
    },
    // --- Makeup: eyes ------------------------------------------------------
    {
      sku: "MASC-01",
      name: "มาสคาร่ากันน้ำ",
      description: "มาสคาร่าเพิ่มความยาว งอนเด้ง กันน้ำ ไม่เป็นก้อน",
      price: "350",
      stock: 35,
    },
    {
      sku: "EYE-001",
      name: "อายแชโดว์พาเลท 12 สี",
      description: "พาเลทอายแชโดว์โทนเอิร์ธโทน 12 สี ทั้งแมตต์และชิมเมอร์",
      price: "459",
      stock: 30,
    },
    {
      sku: "BROW-01",
      name: "ดินสอเขียนคิ้วกันเหงื่อ",
      description: "ดินสอเขียนคิ้วสองหัว มีแปรงปัด ติดทน กันเหงื่อ",
      price: "155",
      stock: 70,
    },
    // --- Skincare ----------------------------------------------------------
    {
      sku: "SKIN-CL-01",
      name: "โฟมล้างหน้าสูตรอ่อนโยน",
      description: "โฟมล้างหน้าเนื้อครีม ทำความสะอาดล้ำลึก ไม่ทำให้ผิวแห้งตึง",
      price: "199",
      stock: 90,
    },
    {
      sku: "SKIN-TN-01",
      name: "โทนเนอร์เช็ดหน้าลดสิว",
      description: "โทนเนอร์ผสม BHA ช่วยลดสิว กระชับรูขุมขน",
      price: "289",
      stock: 55,
    },
    {
      sku: "SKIN-SE-01",
      name: "เซรั่มวิตามินซี",
      description: "เซรั่มวิตามินซีเข้มข้น ช่วยให้ผิวกระจ่างใส ลดจุดด่างดำ",
      price: "690",
      stock: 40,
    },
    {
      sku: "SKIN-SE-02",
      name: "เซรั่มไฮยาลูรอนบำรุงผิว",
      description: "เซรั่มไฮยาลูรอน เติมน้ำให้ผิวชุ่มชื้น ฉ่ำวาว",
      price: "650",
      stock: 40,
    },
    {
      sku: "SKIN-MO-01",
      name: "ครีมบำรุงผิวหน้ากลางวัน",
      description: "มอยส์เจอไรเซอร์เนื้อบางเบา ซึมไว บำรุงผิวชุ่มชื้นทั้งวัน",
      price: "420",
      stock: 50,
    },
    {
      sku: "SKIN-SUN-01",
      name: "ครีมกันแดดหน้า SPF50 PA++++",
      description: "กันแดดเนื้อบางเบา ไม่เหนียวเหนอะ ปกป้องผิวจากแสงแดด",
      price: "390",
      stock: 65,
    },
    {
      sku: "SKIN-MK-01",
      name: "มาสก์หน้าแผ่นบำรุงผิว (10 แผ่น)",
      description: "แผ่นมาสก์เซรั่มเข้มข้น เติมความชุ่มชื้น แพ็ค 10 แผ่น",
      price: "250",
      stock: 60,
    },
    // --- Haircare ----------------------------------------------------------
    {
      sku: "HAIR-SH-01",
      name: "แชมพูลดผมร่วง",
      description: "แชมพูสูตรอ่อนโยน ลดผมขาดหลุดร่วง บำรุงรากผมให้แข็งแรง",
      price: "260",
      stock: 55,
    },
    {
      sku: "HAIR-CO-01",
      name: "ครีมนวดผมบำรุงล้ำลึก",
      description: "ครีมนวดผมเนื้อเข้มข้น ฟื้นบำรุงผมแห้งเสีย นุ่มลื่น",
      price: "260",
      stock: 50,
    },
    {
      sku: "HAIR-SE-01",
      name: "เซรั่มบำรุงปลายผม",
      description: "เซรั่มบำรุงผม ลดชี้ฟู ปลายผมนุ่มสลวย ไม่เหนียวเหนอะ",
      price: "320",
      stock: 45,
    },
    // --- Body & bath -------------------------------------------------------
    {
      sku: "BODY-WS-01",
      name: "ครีมอาบน้ำกลิ่นดอกไม้",
      description: "ครีมอาบน้ำเนื้อนุ่ม กลิ่นหอมดอกไม้ ผิวชุ่มชื้นหลังอาบ",
      price: "185",
      stock: 70,
    },
    {
      sku: "BODY-LO-01",
      name: "โลชั่นบำรุงผิวกายผิวขาว",
      description: "โลชั่นผสมไนอาซินาไมด์ บำรุงผิวเนียนนุ่ม กระจ่างใส",
      price: "230",
      stock: 60,
    },
    {
      sku: "BODY-SUN-01",
      name: "ครีมกันแดดผิวกาย SPF50",
      description: "กันแดดสำหรับผิวกาย เนื้อบางเบา ซึมไว กันน้ำ",
      price: "310",
      stock: 40,
    },
    // --- Fragrance ---------------------------------------------------------
    {
      sku: "PERF-01",
      name: "น้ำหอมกลิ่นซากุระ 30ml",
      description: "น้ำหอม Eau de Parfum กลิ่นซากุระหวานละมุน ติดทนนาน",
      price: "590",
      stock: 30,
    },
  ];
  await db
    .insert(products)
    .values(catalog.map((p) => ({ ...p, tenantId, currency: "THB" })))
    .onConflictDoNothing({ target: [products.tenantId, products.sku] });

  const dbProducts = await db
    .select({ id: products.id, sku: products.sku })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  const bySku = new Map(dbProducts.map((p) => [p.sku, p.id]));

  // 7. Cross-sell pairs — help the AI suggest natural add-ons --------------
  // The lipstick → brush-on pair is the docs/01-summary.md use case.
  const crossSellPairs: Array<{
    from: string;
    to: string;
    reason: string;
    weight: number;
  }> = [
    { from: "LIP-001", to: "BRUSH-01", reason: "โทนสีเข้ากัน แต่งหน้าครบลุค", weight: 10 },
    { from: "FOUND-01", to: "POWD-01", reason: "ลงแป้งฝุ่นทับให้เมคอัพติดทน คุมมัน", weight: 8 },
    { from: "FOUND-01", to: "CONC-01", reason: "ปกปิดรอยคล้ำก่อนลงรองพื้นให้เนียนขึ้น", weight: 7 },
    { from: "CUSH-01", to: "POWD-01", reason: "เซ็ตคุชชั่นด้วยแป้งฝุ่นให้อยู่ทน", weight: 7 },
    { from: "EYE-001", to: "MASC-01", reason: "แต่งตาให้ครบลุคด้วยมาสคาร่างอนเด้ง", weight: 8 },
    { from: "EYE-001", to: "BROW-01", reason: "เขียนคิ้วให้เข้ากับลุคตา", weight: 6 },
    { from: "SKIN-CL-01", to: "SKIN-TN-01", reason: "ล้างหน้าแล้วเช็ดโทนเนอร์ต่อ กระชับรูขุมขน", weight: 8 },
    { from: "SKIN-TN-01", to: "SKIN-SE-01", reason: "ลงเซรั่มวิตามินซีหลังโทนเนอร์ให้ผิวกระจ่างใส", weight: 8 },
    { from: "SKIN-SE-01", to: "SKIN-MO-01", reason: "ปิดท้ายด้วยครีมบำรุงล็อกความชุ่มชื้น", weight: 7 },
    { from: "SKIN-MO-01", to: "SKIN-SUN-01", reason: "ทากันแดดต่อทุกเช้าเพื่อปกป้องผิว", weight: 9 },
    { from: "HAIR-SH-01", to: "HAIR-CO-01", reason: "ใช้แชมพูคู่ครีมนวดสูตรเดียวกันให้ผลลัพธ์ดีขึ้น", weight: 9 },
    { from: "HAIR-CO-01", to: "HAIR-SE-01", reason: "จบด้วยเซรั่มบำรุงปลายผม ลดชี้ฟู", weight: 6 },
    { from: "BODY-WS-01", to: "BODY-LO-01", reason: "อาบน้ำเสร็จทาโลชั่นบำรุงผิวเนียนนุ่ม", weight: 7 },
  ];

  const crossSellRows = crossSellPairs
    .map((p) => {
      const productId = bySku.get(p.from);
      const suggestedProductId = bySku.get(p.to);
      if (!productId || !suggestedProductId) return null;
      return {
        tenantId,
        productId,
        suggestedProductId,
        reason: p.reason,
        weight: p.weight,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (crossSellRows.length > 0) {
    await db
      .insert(crossSells)
      .values(crossSellRows)
      .onConflictDoNothing({
        target: [
          crossSells.tenantId,
          crossSells.productId,
          crossSells.suggestedProductId,
        ],
      });
  }

  // Summary ----------------------------------------------------------------
  const counts = {
    users: (
      await db.select().from(users).where(eq(users.tenantId, tenantId))
    ).length,
    stages: (
      await db.select().from(salesStages).where(eq(salesStages.tenantId, tenantId))
    ).length,
    channels: (
      await db.select().from(channels).where(eq(channels.tenantId, tenantId))
    ).length,
    products: dbProducts.length,
    crossSells: (
      await db.select().from(crossSells).where(eq(crossSells.tenantId, tenantId))
    ).length,
  };
  console.log("seed complete:", counts);

  await createDbSqlClient().end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
