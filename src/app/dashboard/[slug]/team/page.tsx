import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug, listUsers } from "@/db/repositories/tenants";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { ROLES } from "@/features/team/roles";

import {
  addUserAction,
  changeRoleAction,
  removeUserAction,
  setUserPasswordAction,
} from "../../actions";
import { Shell } from "../_components/shell";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "manage_team");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const members = await listUsers(db, tenant.id);

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
      <h1>ทีมงาน</h1>
        <p className="muted">
          สิทธิ์: OWNER/ADMIN จัดการทั้งหมด · SALES แก้การขาย · SUPPORT ตอบแชท · VIEWER ดูอย่างเดียว
        </p>

        {members.length === 0 ? (
          <p className="muted">ยังไม่มีสมาชิก</p>
        ) : (
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>อีเมล</th>
                <th>บทบาท</th>
                <th>ตั้งรหัสผ่าน</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.email}
                    <br />
                    <span className="muted" style={{ fontSize: "0.78rem" }}>
                      {u.name ?? "-"}
                      {u.passwordHash ? " · ตั้งรหัสแล้ว" : " · ยังไม่ตั้งรหัส"}
                    </span>
                  </td>
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
                    <form action={setUserPasswordAction} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="userId" value={u.id} />
                      <input
                        type="password"
                        name="password"
                        placeholder="≥ 6 ตัว"
                        minLength={6}
                        required
                      />
                      <button type="submit">ตั้ง</button>
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
          </div>
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
          สมาชิกเข้าสู่ระบบที่ <code className="url">/dashboard/{slug}/login</code>{" "}
          ด้วยอีเมล + รหัสที่ตั้งให้
        </p>
    </Shell>
  );
}
