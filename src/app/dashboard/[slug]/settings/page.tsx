import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { channels } from "@/db/schema";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { hasGeminiApiKey } from "@/lib/env";

import {
  addKnowledgeAction,
  connectFacebookAction,
  connectLineAction,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const { ok, error } = await searchParams;
  const session = await requireTenantAuth(slug);
  await requirePermission(session, "manage_settings");
  const db = createDbClient();
  const tenant = await getTenantBySlug(db, slug);
  if (!tenant) notFound();

  const chans = await db
    .select()
    .from(channels)
    .where(eq(channels.tenantId, tenant.id));

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  return (
    <>
      <div className="topbar">
        <span className="brand">
          <Link href="/dashboard">AI Sales CRM</Link> /{" "}
          <Link href={`/dashboard/${slug}`}>{tenant.name}</Link> / ตั้งค่า
        </span>
      </div>
      <div className="container" style={{ maxWidth: 640 }}>
        <h1>ตั้งค่าร้าน</h1>
        {ok ? <p className="ok">บันทึกแล้ว ({ok})</p> : null}
        {error === "nokey" ? (
          <p className="error">ยังไม่ได้ตั้งค่า GEMINI_API_KEY — อัปโหลดความรู้ไม่ได้</p>
        ) : error ? (
          <p className="error">เกิดข้อผิดพลาด ({error}) — ตรวจข้อมูลแล้วลองใหม่</p>
        ) : null}

        <h2>ช่องทางที่เชื่อมแล้ว</h2>
        {chans.length === 0 ? (
          <p className="muted">ยังไม่ได้เชื่อมช่องทาง</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ช่องทาง</th>
                <th>Webhook URL (ตั้งในคอนโซลของช่องทาง)</th>
              </tr>
            </thead>
            <tbody>
              {chans.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.type}
                    <br />
                    <span className="muted">{c.displayName}</span>
                  </td>
                  <td>
                    <code className="url">
                      {base}/api/webhooks/
                      {c.type === "LINE" ? "line" : "facebook"}/{c.id}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2>เชื่อม LINE OA</h2>
        <form action={connectLineAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ชื่อที่แสดง
            <input name="displayName" placeholder="LINE OA ของร้าน" />
          </label>
          <label>
            Basic ID (เช่น @yourshop)
            <input name="basicId" required placeholder="@yourshop" />
          </label>
          <label>
            Channel Secret
            <input name="channelSecret" required />
          </label>
          <label>
            Channel Access Token
            <input name="accessToken" required />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            เชื่อม LINE
          </button>
        </form>

        <h2>เชื่อม Facebook Page</h2>
        <form action={connectFacebookAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ชื่อที่แสดง
            <input name="displayName" placeholder="เพจของร้าน" />
          </label>
          <label>
            Page ID
            <input name="pageId" required />
          </label>
          <label>
            Page Access Token
            <input name="accessToken" required />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            เชื่อม Facebook
          </button>
        </form>

        <h2>อัปโหลดความรู้ (RAG)</h2>
        {!hasGeminiApiKey() ? (
          <p className="muted">ต้องตั้งค่า GEMINI_API_KEY ก่อนจึงจะอัปโหลดได้</p>
        ) : null}
        <form action={addKnowledgeAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            หัวข้อ
            <input name="title" required placeholder="เช่น นโยบายจัดส่ง" />
          </label>
          <label>
            เนื้อหา (วางข้อความ FAQ/นโยบายร้าน)
            <textarea name="text" rows={6} required />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            เพิ่มความรู้
          </button>
        </form>
      </div>
    </>
  );
}
