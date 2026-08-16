import { CopyCode } from "./copy-code";

/** In-app step-by-step guide for connecting LINE / Facebook, with the real
 *  values (verify token, webhook URL) shown so the merchant can copy them. */
export function ConnectGuide({
  webhookBase,
  verifyToken,
  fbConnected,
}: {
  webhookBase: string;
  verifyToken?: string;
  fbConnected?: boolean;
}) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <strong>ยังไม่รู้จะเชื่อมยังไง? กดดูวิธีทีละขั้น 👇</strong>

      <details className="guide">
        <summary>🟢 วิธีเชื่อม LINE (ง่าย — ~5 นาที)</summary>
        <ol>
          <li>
            เข้า{" "}
            <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer">
              LINE Developers Console
            </a>{" "}
            → สร้าง/เลือก Provider → สร้าง Channel แบบ <b>Messaging API</b>
          </li>
          <li>
            แท็บ <b>Basic settings</b> → คัดลอก <b>Channel secret</b>
          </li>
          <li>
            แท็บ <b>Messaging API</b> → <b>Channel access token (long-lived)</b> →
            กด <b>Issue</b> → คัดลอก token
          </li>
          <li>
            เอา Channel secret + token + Basic ID (@xxx) มากรอกในฟอร์ม{" "}
            <b>“เชื่อม LINE OA”</b> ด้านล่าง แล้วกดบันทึก
          </li>
          <li>
            หลังบันทึก คัดลอก <b>Webhook URL</b> ในตาราง “ช่องทางที่เชื่อมแล้ว” →
            วางในแท็บ Messaging API ช่อง <b>Webhook URL</b> → กด <b>Verify</b> →
            เปิด <b>Use webhook</b>
          </li>
          <li>
            ปิด <b>Auto-reply</b> + <b>Greeting message</b> ใน OA เพื่อให้บอทเราตอบแทน
          </li>
        </ol>
      </details>

      <details className="guide">
        <summary>🔵 วิธีเชื่อม Facebook Messenger (~10 นาที)</summary>
        <ol>
          <li>
            เข้า{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
              Meta for Developers
            </a>{" "}
            → Create App → ประเภท <b>Business</b> → เพิ่มกรณีใช้งาน{" "}
            <b>Messenger</b>
          </li>
          <li>
            เมนู <b>การตั้งค่าแอพ → ข้อมูลพื้นฐาน</b> → คัดลอก <b>App Secret</b>{" "}
            (แจ้งแอดมินระบบตั้งเป็น{" "}
            <code className="url">META_APP_SECRET</code> — ทำครั้งเดียวทั้งระบบ)
          </li>
          <li>
            เมนู <b>กรณีการใช้งาน → การตั้งค่า Messenger API</b> → เลื่อนไปหัวข้อ{" "}
            <b>โทเค็นการเข้าถึง</b> → เชื่อมเพจร้าน → กด <b>สร้าง (Generate)</b> →
            คัดลอก <b>Page Access Token</b> (Page ID จะอยู่ข้างชื่อเพจ)
          </li>
          <li>
            เอา Page ID + Token มากรอกฟอร์ม <b>“เชื่อม Facebook Page”</b> ด้านล่าง
            แล้วกดบันทึก — ระบบจะ <b>subscribe เพจให้อัตโนมัติ</b> (ไม่ต้องกดเองใน Meta)
          </li>
          <li>
            กลับไปหัวข้อ <b>1. กำหนดค่า Webhooks</b> ในหน้า Messenger API แล้วกรอก:
            <div style={{ margin: "8px 0", display: "grid", gap: 6 }}>
              <CopyCode
                label="URL การเรียกกลับ:"
                value={
                  fbConnected
                    ? "ดูค่าจริงในตาราง “ช่องทางที่เชื่อมแล้ว” ด้านล่าง"
                    : `${webhookBase}/api/webhooks/facebook/<เชื่อมเพจก่อน>`
                }
              />
              {verifyToken ? (
                <CopyCode label="ตรวจสอบยืนยันโทเค็น:" value={verifyToken} />
              ) : (
                <span className="muted">
                  ตรวจสอบยืนยันโทเค็น: แอดมินยังไม่ได้ตั้ง META_VERIFY_TOKEN
                </span>
              )}
            </div>
            → กด <b>ตรวจสอบยืนยันและบันทึก</b> (จะขึ้นถูกเขียว)
          </li>
          <li>
            ทักเพจร้านของคุณใน Messenger เพื่อทดสอบ — บอทจะตอบทันที ✅
            <br />
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              ช่วงทดสอบ (แอปยังไม่ผ่าน App Review) ตอบได้เฉพาะแอดมิน/ผู้ทดสอบของแอป
              — ใช้กับลูกค้าทั่วไปต้องผ่าน App Review + Business Verification ก่อน
            </span>
          </li>
        </ol>
      </details>
    </div>
  );
}
