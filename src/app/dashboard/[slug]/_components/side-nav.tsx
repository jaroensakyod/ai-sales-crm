"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { roleCan, type Permission, type Role } from "@/features/team/roles";

type BizType = "CATALOG" | "BOOKING" | "COURSE" | "HOTEL";

/** Plan-gated modules — a menu item hidden when the tenant's plan lacks it. */
export type NavModules = {
  hotelModule: boolean;
  courseModule: boolean;
  promoBroadcast: boolean;
  apiWebhooks: boolean;
};
type ModuleKey = keyof NavModules;

// `biz` gates a module to a business type — a shop that sells products never
// sees the hotel menu, a salon never sees products, etc. `ent` gates a module
// to the tenant's plan (hotel = Business, course/broadcast = Pro+). Items with
// neither are core and always show.
const ITEMS: {
  href: string;
  label: string;
  icon: string;
  perm?: Permission;
  biz?: BizType;
  ent?: ModuleKey;
}[] = [
  { href: "", label: "ภาพรวม", icon: "📊" },
  { href: "/products", label: "สินค้า", icon: "🛒", perm: "edit_sales", biz: "CATALOG" },
  { href: "/leads", label: "Pipeline", icon: "🎯" },
  { href: "/orders", label: "ออเดอร์", icon: "🧾", perm: "edit_sales", biz: "CATALOG" },
  { href: "/booking", label: "จองคิว", icon: "📅", perm: "edit_sales", biz: "BOOKING" },
  { href: "/hotel", label: "โรงแรม/ห้องพัก", icon: "🏨", perm: "edit_sales", biz: "HOTEL", ent: "hotelModule" },
  { href: "/courses", label: "คอร์ส/สมาชิก", icon: "🎓", perm: "edit_sales", biz: "COURSE", ent: "courseModule" },
  { href: "/promotions", label: "โปรโมชั่น", icon: "🎁", perm: "edit_sales", biz: "CATALOG" },
  { href: "/reviews", label: "รีวิวลูกค้า", icon: "⭐", perm: "edit_sales" },
  { href: "/broadcast", label: "ยิงโปรฯ LINE", icon: "📣", perm: "manage_settings", ent: "promoBroadcast" },
  { href: "/webhooks", label: "API / Webhook", icon: "🔗", perm: "manage_settings", ent: "apiWebhooks" },
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
  modules,
}: {
  slug: string;
  role: string;
  businessTypes?: string[];
  modules: NavModules;
}) {
  const pathname = usePathname();
  const base = `/dashboard/${slug}`;

  return (
    <nav className="nav">
      {ITEMS.filter(
        (i) =>
          (!i.perm || roleCan(role as Role, i.perm)) &&
          (!i.biz || businessTypes.includes(i.biz)) &&
          (!i.ent || modules[i.ent]),
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
