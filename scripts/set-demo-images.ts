/**
 * Set the demo product images to the shop's Drive photos (served as direct image
 * URLs). Run: node --env-file=.env --import tsx scripts/set-demo-images.ts
 */
import { createDbClient, createDbSqlClient } from "@/db/client";
import { listProducts, updateProduct } from "@/db/repositories/products";
import { getTenantBySlug } from "@/db/repositories/tenants";

const SLUG = "demo-store";
// =w600 keeps the file comfortably under LINE's 1MB preview-image limit.
const drive = (id: string) => `https://lh3.googleusercontent.com/d/${id}=w600`;

const IMAGES: { match: string; url: string }[] = [
  { match: "Standard", url: drive("1kpBdEwCJ67FYI_wzNYzB0yuPy3S4uniZ") },
  { match: "Premium", url: drive("1opO7Ca3vJXR_XpKbF4vzO9PiLQmAobAd") },
  { match: "Course", url: drive("1FX17DmUynrwidO1XMinc8ygyq1VVqTY_") },
];

async function main() {
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, SLUG);
  if (!tenant) throw new Error(`tenant '${SLUG}' not found`);
  const products = await listProducts(db, tenant.id);

  for (const { match, url } of IMAGES) {
    const p = products.find((x) => x.name.includes(match));
    if (!p) {
      console.log(`! no product matching "${match}"`);
      continue;
    }
    await updateProduct(db, tenant.id, p.id, { imageUrl: url });
    console.log(`✓ ${p.name} → image set`);
  }

  await createDbSqlClient().end();
  console.log("done.");
}

main().catch((err) => {
  console.error("failed:", err);
  process.exit(1);
});
