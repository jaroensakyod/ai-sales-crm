import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug, listUsers } from "@/db/repositories/tenants";
import { ROLES } from "@/features/team/roles";

import {
  addUserAction,
  changeRoleAction,
  removeUserAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const members = await listUsers(db, tenant.id);

  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/dashboard">AI Sales CRM</Link> /{" "}
          <Link href={`/dashboard/${slug}`}>{tenant.name}</Link> / ทีม
        </span>
      </div>
      <div className="container" style={{ maxWidth: 720 }}>
        <h1>ทีมงาน</h1>
        <p className="muted">
          สิทธิ์: OWNER/ADMIN จัดการทั้งหมด · SALES แก้การขาย · SUPPORT ตอบแชท · VIEWER ดูอย่างเดียว
        </p>

        {members.length === 0 ? (
          <p className="muted">ยังไม่มีสมาชิก</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>อีเมล</th>
                <th>ชื่อ</th>
                <th>บทบาท</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? "-"}</td>
                  <td>
                    <form action={changeRoleAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="role" defaultValue={u.role}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button type="submit">บันทึก</button>
                    </form>
                  </td>
                  <td>
                    <form action={removeUserAction}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit">ลบ</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>เพิ่มสมาชิก</h2>
        <form action={addUserAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            อีเมล
            <input name="email" required placeholder="teammate@shop.com" />
          </label>
          <label>
            ชื่อ
            <input name="name" placeholder="ชื่อสมาชิก" />
          </label>
          <label>
            บทบาท
            <select name="role" defaultValue="SALES">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            เพิ่มสมาชิก
          </button>
        </form>
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          * เดโม — ยังใช้รหัสผ่านรวมเข้าแดชบอร์ด ระบบล็อกอินรายบุคคลจะเพิ่มภายหลัง
        </p>
      </div>
    </>
  );
}
