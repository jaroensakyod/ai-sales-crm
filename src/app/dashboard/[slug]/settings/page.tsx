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

/** Sensible starter text for the AI's extra-instructions field, pre-filled so a
 *  new store isn't staring at a blank box. Merchants edit it to fit their shop. */
const DEFAULT_SYSTEM_PROMPT_EXTRA = [
  "• พูดสุภาพ เป็นกันเอง เหมือนแอดมินคนจริง ตอบสั้น กระชับ ทีละประเด็น",
  "• ถามความต้องการลูกค้าก่อน แล้วค่อยแนะนำสินค้าที่เหมาะที่สุด 1 อย่าง อย่ายัดขาย",
  "• ตอบคำถามที่ลูกค้าถามจริง ๆ ก่อน (ดีไหม/ใช้ยังไง/ต่างกันยังไง) ค่อยเข้าเรื่องราคา",
  "• ถ้าลูกค้าลังเล ให้ช่วยสรุปข้อดีและชวนตัดสินใจแบบไม่กดดัน",
  "• เรื่องโปรโมชั่น/ส่วนลด ให้ยึดตามที่ร้านตั้งไว้ในระบบเท่านั้น ห้ามสัญญาเกินจริง",
].join("\n");

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
    <Shell slug={slug} tenantName={tenant.name} role={session.role} businessTypes={tenant.businessTypes}>
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
                ["HOTEL", "โรงแรม/ที่พัก"],
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
        <div className="card" style={{ background: "#f7fbff", borderColor: "#cfe4ff" }}>
          <strong>อยากให้ AI ตอบเก่งขึ้น? ทำ 4 อย่างนี้ 👇</strong>
          <ol style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              กรอก <strong>“รายละเอียดสินค้า”</strong> ในแต่ละสินค้าให้ครบ (จุดเด่น
              วิธีใช้ เหมาะกับใคร) — AI อ่านช่องนี้ตอบลูกค้าโดยตรง ยิ่งละเอียดยิ่งตอบตรง
            </li>
            <li>
              ถ้ามีหลายเวอร์ชัน/ราคา ให้เพิ่มเป็น <strong>“ตัวเลือกสินค้า”</strong> (เช่น
              PDF / เล่มปกแข็ง) ระบบจะให้ลูกค้าเลือกและออกออเดอร์ตามราคาที่ตั้งไว้
            </li>
            <li>
              เพิ่ม <strong>“คลังความรู้”</strong> ด้านล่างสำหรับคำถามที่ถามบ่อย (นโยบายส่ง
              การรับประกัน วิธีสั่ง ฯลฯ)
            </li>
            <li>
              เขียน <strong>“ข้อมูล/คำแนะนำเพิ่มเติม”</strong> ด้านล่างให้ AI รู้สไตล์ร้าน
              และโปรโมชั่นปัจจุบัน
            </li>
          </ol>
          <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.82rem" }}>
            หมายเหตุ: AI จะไม่ส่งเลขบัญชีเอง — ลูกค้าต้องกดปุ่ม “ยืนยันสั่งซื้อ” ก่อน
            ระบบถึงส่งข้อมูลการโอนให้ (กันบอทพ่นเลขบัญชีมั่ว)
          </p>
        </div>
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
              rows={6}
              defaultValue={
                aiSettings?.systemPromptExtra ?? DEFAULT_SYSTEM_PROMPT_EXTRA
              }
              placeholder="เช่น ร้านเราเน้นบริการเป็นกันเอง ปิดท้ายด้วยอิโมจิเสมอ"
            />
            <span className="muted" style={{ fontSize: "0.8rem" }}>
              เราใส่ตัวอย่างเริ่มต้นให้แล้ว — แก้ให้ตรงกับร้านคุณได้เลย
            </span>
          </label>

          <fieldset
            style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}
          >
            <legend style={{ fontWeight: 600, padding: "0 6px" }}>
              การติดตามลูกค้าอัตโนมัติ (Follow-up)
            </legend>
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
              ข้อความติดตามแต่ละครั้งนับเป็น 1 ข้อความในโควตา LINE — ปิดอันที่ไม่ต้องการ
              เพื่อประหยัดเครดิต (การตอบแชทปกติของบอทไม่กินโควตา)
            </p>
            <label className="inline">
              <input
                type="checkbox"
                name="followupCartRecovery"
                defaultChecked={aiSettings?.followupCartRecovery ?? true}
              />
              ตามลูกค้าที่สั่งแล้วยังไม่จ่าย (หลัง 3 ชม.)
            </label>
            <label className="inline">
              <input
                type="checkbox"
                name="followupReminder"
                defaultChecked={aiSettings?.followupReminder ?? true}
              />
              เตือนนัดหมาย/วันเข้าพัก (1 วันก่อนถึง)
            </label>
            <label className="inline">
              <input
                type="checkbox"
                name="followupReviewRequest"
                defaultChecked={aiSettings?.followupReviewRequest ?? true}
              />
              ขอรีวิวหลังปิดการขาย (หลัง 24 ชม.)
            </label>
          </fieldset>

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
        {ok === "fb_connected" ? (
          <p className="ok">เชื่อมเพจ Facebook สำเร็จแล้ว 🎉</p>
        ) : null}
        {error === "fb_oauth" ? (
          <p className="error">เชื่อม Facebook ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        ) : null}
        {error === "fb_nopages" ? (
          <p className="error">
            ไม่พบเพจในบัญชีนี้ — ต้องเป็นแอดมินของเพจ และเลือกอนุญาตเพจตอนล็อกอิน
          </p>
        ) : null}
        {error === "fb_cancelled" ? (
          <p className="error">ยกเลิกการเชื่อม Facebook</p>
        ) : null}
        {error === "fb_notconfigured" ? (
          <p className="error">ระบบยังไม่ได้ตั้งค่า META_APP_ID / META_APP_SECRET</p>
        ) : null}

        <div className="card">
          <p style={{ marginTop: 0, fontWeight: 500 }}>วิธีง่าย (แนะนำ)</p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            กดปุ่มด้านล่าง แล้วล็อกอิน Facebook เลือกเพจของคุณ ระบบจะดึงข้อมูลและ
            เปิดรับข้อความให้อัตโนมัติ ไม่ต้องหา Page ID / Token เอง
          </p>
          <a href={`/api/connect/facebook?slug=${slug}`}>
            <button type="button" style={{ marginTop: 4 }}>
              เชื่อมต่อ Facebook (เลือกเพจอัตโนมัติ)
            </button>
          </a>
        </div>

        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: "pointer" }}>
            หรือกรอกเอง (Page ID + Access Token)
          </summary>
          <form action={connectFacebookAction} className="card" style={{ marginTop: 8 }}>
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
        </details>

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
