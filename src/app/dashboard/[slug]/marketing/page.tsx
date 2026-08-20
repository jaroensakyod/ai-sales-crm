import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { Shell } from "../_components/shell";
import { WelcomeSection } from "../welcome/page";
import { ReviewsSection } from "../reviews/page";
import { PromotionsSection } from "../promotions/page";

export const dynamic = "force-dynamic";

export default async function MarketingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "edit_sales");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();
  const divider = <div style={{ margin: "36px 0", borderTop: "1px solid var(--border)" }} />;
  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <WelcomeSection slug={slug} ok={sp.ok} error={sp.error} />
      {divider}
      <ReviewsSection slug={slug} ok={sp.ok} error={sp.error} />
      {divider}
      <PromotionsSection slug={slug} />
    </Shell>
  );
}
