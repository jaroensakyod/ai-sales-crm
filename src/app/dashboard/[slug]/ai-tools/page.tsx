import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";

import { Shell } from "../_components/shell";
import { AutomationSection } from "../automation/page";
import { TagsSection } from "../tags/page";
import { GapsSection } from "../gaps/page";

export const dynamic = "force-dynamic";

export default async function AiToolsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "manage_settings");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();
  const divider = <div style={{ margin: "36px 0", borderTop: "1px solid var(--border)" }} />;
  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
      <AutomationSection slug={slug} />
      {divider}
      <TagsSection slug={slug} />
      {divider}
      <GapsSection slug={slug} ok={sp.ok} error={sp.error} />
    </Shell>
  );
}
