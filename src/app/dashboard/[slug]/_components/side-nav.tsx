"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { roleCan, type Permission, type Role } from "@/features/team/roles";

const ITEMS: {
  href: string;
  label: string;
  icon: string;
  perm?: Permission;
}[] = [
  { href: "", label: "ภาพรวม", icon: "📊" },
  { href: "/products", label: "สินค้า", icon: "🛒", perm: "edit_sales" },
  { href: "/leads", label: "Pipeline", icon: "🎯" },
  { href: "/orders", label: "ออเดอร์", icon: "🧾", perm: "edit_sales" },
  { href: "/promotions", label: "โปรโมชั่น", icon: "🎁", perm: "edit_sales" },
  { href: "/automation", label: "ระบบอัตโนมัติ", icon: "⚡", perm: "manage_settings" },
  { href: "/gaps", label: "คำถามที่ตอบไม่ได้", icon: "❓" },
  { href: "/analytics", label: "วิเคราะห์", icon: "📈" },
  { href: "/settings", label: "ตั้งค่า", icon: "⚙️", perm: "manage_settings" },
  { href: "/audit", label: "บันทึกการทำงาน", icon: "📜", perm: "manage_settings" },
  { href: "/team", label: "ทีม", icon: "👥", perm: "manage_team" },
];

export function SideNav({ slug, role }: { slug: string; role: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${slug}`;

  return (
    <nav className="nav">
      {ITEMS.filter((i) => !i.perm || roleCan(role as Role, i.perm)).map((i) => {
        const href = base + i.href;
        const active =
          i.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={i.href}
            href={href}
            className={`nav-item${active ? " active" : ""}`}
          >
            <span className="ic">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
