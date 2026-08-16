import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { createDbClient } from "@/db/client";
import { getTenantAiSettings } from "@/db/repositories/ai";
import { listKnowledgeDocuments } from "@/db/repositories/knowledge";
import { getPaymentSettings } from "@/db/repositories/payment-settings";
import { getTenantBySlug } from "@/db/repositories/tenants";
import { channels } from "@/db/schema";
import { requirePermission, requireTenantAuth } from "@/features/auth/session";
import { TONE_OPTIONS } from "@/features/ai/tone";
import { EMOJI_LEVELS, REPLY_MODES } from "@/features/ai/reply-mode";
import { hasGeminiApiKey } from "@/lib/env";

import {
  addKnowledgeAction,
  connectFacebookAction,
  connectLineAction,
  deleteKnowledgeAction,
  updateAiSettingsAction,
  updatePaymentSettingsAction,
  updateStoreInfoAction,
} from "../../actions";
import { ConnectGuide } from "../_components/connect-guide";
import { CopyCode } from "../_components/copy-code";
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
  const knowledgeDocs = await listKnowledgeDocuments(db, tenant.id);
  const pay = await getPaymentSettings(db, tenant.id);

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

        <h2>ข้อมูลร้าน</h2>
        <form action={updateStoreInfoAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ชื่อร้าน
            <input name="name" defaultValue={tenant.name} required />
          </label>
          <fieldset style={{ border: "none", padding: 0, margin: "10px 0" }}>
            <legend className="muted">ประเภทธุรกิจ</legend>
            {(
              [
                ["CATALOG", "ขายสินค้า"],
                ["BOOKING", "นัดหมาย/บริการ"],
                ["COURSE", "คอร์ส/สมาชิก"],
              ] as const
            ).map(([val, label]) => (
              <label key={val} className="inline">
                <input
                  type="checkbox"
                  name="businessTypes"
                  value={val}
                  defaultChecked={tenant.businessTypes.includes(val)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button type="submit">บันทึกข้อมูลร้าน</button>
        </form>

        <h2>เชื่อมช่องทาง (LINE / Facebook)</h2>
        <ConnectGuide
          webhookBase={base}
          verifyToken={process.env.META_VERIFY_TOKEN}
          fbConnected={chans.some((c) => c.type === "MESSENGER")}
        />

        <h3 style={{ margin: "18px 0 8px" }}>ช่องทางที่เชื่อมแล้ว</h3>
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
                    <CopyCode
                      value={`${base}/api/webhooks/${c.type === "LINE" ? "line" : "facebook"}/${c.id}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        <h2>บัญชีรับเงิน / การชำระเงิน</h2>
        <p className="muted">
          ใช้สร้างข้อความ “แจ้งโอน” ให้ลูกค้าอัตโนมัติ (ในหน้าออเดอร์ + AI บอกได้)
        </p>
        <form action={updatePaymentSettingsAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            ชื่อร้าน (แสดงในข้อความแจ้งโอน)
            <input name="shopName" defaultValue={pay?.shopName ?? ""} placeholder="เช่น ร้านยาหอม" />
          </label>
          <div className="row" style={{ marginTop: 4 }}>
            <label style={{ flex: 1 }}>
              ธนาคาร
              <input name="bankName" defaultValue={pay?.bankName ?? ""} placeholder="กสิกร" />
            </label>
            <label style={{ flex: 1 }}>
              เลขบัญชี
              <input name="bankAccountNo" defaultValue={pay?.bankAccountNo ?? ""} placeholder="054-1-99123-9" />
            </label>
          </div>
          <label>
            ชื่อบัญชี
            <input name="bankAccountName" defaultValue={pay?.bankAccountName ?? ""} placeholder="ธฤษวรรณ ญาณะเครื่อง" />
          </label>
          <div className="row" style={{ marginTop: 4 }}>
            <label style={{ flex: 1 }}>
              พร้อมเพย์ (ถ้ามี)
              <input name="promptpayId" defaultValue={pay?.promptpayId ?? ""} placeholder="เบอร์/เลขบัตร" />
            </label>
            <label style={{ flex: 1 }}>
              โอนภายใน (ชั่วโมง)
              <input name="paymentWindowHours" type="number" defaultValue={pay?.paymentWindowHours ?? 12} />
            </label>
          </div>
          <label>
            ขนส่ง
            <input name="shippingNote" defaultValue={pay?.shippingNote ?? ""} placeholder="Flash Express / ไปรษณีย์ EMS" />
          </label>
          <label>
            ข้อความเพิ่มเติม (ต่อท้าย)
            <textarea name="instructionExtra" rows={2} defaultValue={pay?.instructionExtra ?? ""} placeholder="ขอบคุณค่ะ 🙏" />
          </label>
          <button type="submit" style={{ marginTop: 12 }}>
            บันทึกบัญชีรับเงิน
          </button>
        </form>

        <h2>ตั้งค่าผู้ช่วยขาย AI</h2>
        <form action={updateAiSettingsAction} className="card">
          <input type="hidden" name="slug" value={slug} />
          <label>
            แนวทางการตอบ (โหมดการขาย)
            <select name="replyMode" defaultValue={aiSettings?.replyMode ?? ""}>
              <option value="">— ค่าเริ่มต้น (ที่ปรึกษา ไม่ตื๊อ) —</option>
              {REPLY_MODES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              คุมว่าบอทจะแนะนำ/ชวนซื้อ/ปิดการขายมากน้อยแค่ไหน
            </span>
          </label>
          <label>
            การใช้อิโมจิ
            <select name="emojiLevel" defaultValue={aiSettings?.emojiLevel ?? ""}>
              {EMOJI_LEVELS.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            โทนการตอบของบอท (บุคลิก/น้ำเสียง)
            <select name="replyTone" defaultValue={aiSettings?.replyTone ?? ""}>
              <option value="">— ค่าเริ่มต้น (เป็นกันเอง) —</option>
              {TONE_OPTIONS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
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

        <h2>คลังความรู้ (AI ใช้ค้นตอบ FAQ)</h2>
        {knowledgeDocs.length === 0 ? (
          <p className="muted">ยังไม่มีคลังความรู้ — เพิ่มด้านล่าง</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>หัวข้อ</th>
                  <th>สถานะ</th>
                  <th>ชิ้นข้อมูล</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {knowledgeDocs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>
                      <span className="badge open">{d.status}</span>
                    </td>
                    <td>{d.chunkCount}</td>
                    <td>
                      <form action={deleteKnowledgeAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="documentId" value={d.id} />
                        <button type="submit" className="danger sm">
                          ลบ
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>เพิ่มความรู้ใหม่</h2>
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
