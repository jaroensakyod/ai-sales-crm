import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/dashboard/actions";
import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { isAuthEnabled } from "@/features/auth/session";
import { getEntitlements } from "@/features/billing/entitlements";

import { SideNav } from "./side-nav";

/** Authenticated dashboard shell: sidebar nav + sticky header + content. */
export async function Shell({
  slug,
  tenantName,
  role,
  businessTypes = [],
  children,
}: {
  slug: string;
  tenantName: string;
  role: string;
  businessTypes?: string[];
  children: ReactNode;
}) {
  // Nav visibility follows the plan: hotel = Business, course/broadcast = Pro+.
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  const ent = tenant
    ? await getEntitlements(db, tenant.id)
    : {
        hotelModule: false,
        courseModule: false,
        promoBroadcast: false,
        apiWebhooks: false,
      };
  const modules = {
    hotelModule: ent.hotelModule,
    courseModule: ent.courseModule,
    promoBroadcast: ent.promoBroadcast,
    apiWebhooks: ent.apiWebhooks,
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href="/dashboard">🛍️ AI Sales CRM</Link>
        </div>
        <div className="sidebar-store">{tenantName}</div>
        <SideNav
          slug={slug}
          role={role}
          businessTypes={businessTypes}
          modules={modules}
        />
      </aside>

      <div className="content">
        <header className="header">
          <span style={{ marginRight: "auto", fontWeight: 600 }}>
            {tenantName}
          </span>
          {isAuthEnabled() ? (
            <>
              <span className="role-chip">{role}</span>
              <form action={logoutAction}>
                <input type="hidden" name="slug" value={slug} />
                <button type="submit" className="ghost sm">
                  ออกจากระบบ
                </button>
              </form>
            </>
          ) : (
            <span className="role-chip">โหมดเดโม</span>
          )}
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
