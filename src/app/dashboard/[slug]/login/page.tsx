import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";

import { loginAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function TenantLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  return (
    <div className="login-wrap">
      <h1>{tenant.name}</h1>
      <p className="muted">เข้าสู่ระบบทีมงาน</p>
      <form action={loginAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="email" name="email" placeholder="อีเมล" autoFocus required />
        <input type="password" name="password" placeholder="รหัสผ่าน" required />
        {error ? <div className="error">อีเมลหรือรหัสผ่านไม่ถูกต้อง</div> : null}
        <button type="submit">เข้าสู่ระบบ</button>
      </form>
    </div>
  );
}
