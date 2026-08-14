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
  const catalog = [
    {
      sku: "LIP-001",
      name: "ลิปสติกสีแดง Matte",
      description: "ลิปสติกเนื้อแมตต์ ติดทน สีแดงคลาสสิก",
      price: "390",
      stock: 50,
    },
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
      description: "รองพื้นคุมมัน ติดทนทั้งวัน",
      price: "550",
      stock: 20,
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

  // 7. Cross-sell pair: lipstick → brush-on (the docs use case) ------------
  const lip = bySku.get("LIP-001");
  const brush = bySku.get("BRUSH-01");
  if (lip && brush) {
    await db
      .insert(crossSells)
      .values({
        tenantId,
        productId: lip,
        suggestedProductId: brush,
        reason: "โทนสีเข้ากัน แต่งหน้าครบลุค",
        weight: 10,
      })
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
