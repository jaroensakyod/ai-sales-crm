import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/dashboard/actions";
import { isAuthEnabled } from "@/features/auth/session";

import { SideNav } from "./side-nav";

/** Authenticated dashboard shell: sidebar nav + sticky header + content. */
export function Shell({
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
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href="/dashboard">🛍️ AI Sales CRM</Link>
        </div>
        <div className="sidebar-store">{tenantName}</div>
        <SideNav slug={slug} role={role} businessTypes={businessTypes} />
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
