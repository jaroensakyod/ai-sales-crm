import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { channels } from "@/db/schema";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { hasGeminiApiKey } from "@/lib/env";

import {
  addKnowledgeAction,
  connectFacebookAction,
  connectLineAction,
  updateAiSettingsAction,
} from "../../actions";
import { Shell } from "../_components/shell";

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
  const aiSettings = await getTenantAiSettings(db, tenant.id);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const base = `${proto}://${host}`;

  return (
    <Shell slug={slug} tenantName={tenant.name} role={session.role}>
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
          <div className="table-wrap">
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
          </div>
        )}

        <h2>ตั้งค่าผู้ช่วยขาย AI</h2>
        <form action={updateAiSettingsAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ส่วนลดที่ AI ให้ได้สูงสุด (บาท)
            <input
              name="discountAuthority"
              type="number"
              step="0.01"
              defaultValue={Number(aiSettings?.discountAuthority ?? 0)}
            />
          </label>
          <label>
            คำต้องห้าม (คั่นด้วยบรรทัดหรือ , — AI จะไม่พูดคำเหล่านี้)
            <textarea
              name="bannedPhrases"
              rows={2}
              defaultValue={(aiSettings?.bannedPhrases ?? []).join(", ")}
              placeholder="เช่น รักษาสิว, หน้าใส 100%"
            />
          </label>
          <label>
            ข้อมูล/คำแนะนำเพิ่มเติมให้ AI (สไตล์การพูด, โปรโมชั่น ฯลฯ)
            <textarea
              name="systemPromptExtra"
              rows={3}
              defaultValue={aiSettings?.systemPromptExtra ?? ""}
              placeholder="เช่น ร้านเราเน้นบริการเป็นกันเอง ปิดท้ายด้วยอิโมจิเสมอ"
            />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            บันทึกการตั้งค่า AI
          </button>
        </form>

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
    </Shell>
  );
}
