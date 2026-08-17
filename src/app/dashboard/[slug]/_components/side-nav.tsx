"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { roleCan, type Permission, type Role } from "@/features/team/roles";

type BizType = "CATALOG" | "BOOKING" | "COURSE" | "HOTEL";

// `biz` gates a module to a business type — a shop that sells products never
// sees the hotel menu, a salon never sees products, etc. Items without `biz`
// are core and always show.
const ITEMS: {
  href: string;
  label: string;
  icon: string;
  perm?: Permission;
  biz?: BizType;
}[] = [
  { href: "", label: "ภาพรวม", icon: "📊" },
  { href: "/products", label: "สินค้า", icon: "🛒", perm: "edit_sales", biz: "CATALOG" },
  { href: "/leads", label: "Pipeline", icon: "🎯" },
  { href: "/orders", label: "ออเดอร์", icon: "🧾", perm: "edit_sales", biz: "CATALOG" },
  { href: "/booking", label: "จองคิว", icon: "📅", perm: "edit_sales", biz: "BOOKING" },
  { href: "/hotel", label: "โรงแรม/ห้องพัก", icon: "🏨", perm: "edit_sales", biz: "HOTEL" },
  { href: "/promotions", label: "โปรโมชั่น", icon: "🎁", perm: "edit_sales", biz: "CATALOG" },
  { href: "/broadcast", label: "ยิงโปรฯ LINE", icon: "📣", perm: "manage_settings" },
  { href: "/tags", label: "แท็กคุมคำตอบ", icon: "🏷️", perm: "manage_settings" },
  { href: "/automation", label: "ระบบอัตโนมัติ", icon: "⚡", perm: "manage_settings" },
  { href: "/gaps", label: "คำถามที่ตอบไม่ได้", icon: "❓" },
  { href: "/analytics", label: "วิเคราะห์", icon: "📈" },
  { href: "/settings", label: "ตั้งค่า", icon: "⚙️", perm: "manage_settings" },
  { href: "/audit", label: "บันทึกการทำงาน", icon: "📜", perm: "manage_settings" },
  { href: "/team", label: "ทีม", icon: "👥", perm: "manage_team" },
];

export function SideNav({
  slug,
  role,
  businessTypes = [],
}: {
  slug: string;
  role: string;
  businessTypes?: string[];
}) {
  const pathname = usePathname();
  const base = `/dashboard/${slug}`;

  return (
    <nav className="nav">
      {ITEMS.filter(
        (i) =>
          (!i.perm || roleCan(role as Role, i.perm)) &&
          (!i.biz || businessTypes.includes(i.biz)),
      ).map((i) => {
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
