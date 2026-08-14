/** In-app step-by-step guide for getting LINE / Facebook credentials. */
export function ConnectGuide({ webhookBase }: { webhookBase: string }) {
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <strong>ยังไม่รู้จะเอา Token จากไหน? กดดูวิธีทีละขั้น 👇</strong>

      <details className="guide">
        <summary>🟢 วิธีเชื่อม LINE (Messaging API)</summary>
        <ol>
          <li>
            เข้า{" "}
            <a href="https://manager.line.biz" target="_blank" rel="noreferrer">
              LINE OA Manager
            </a>{" "}
            → สร้าง/เลือก Official Account ของร้าน
          </li>
          <li>
            ในหน้า OA → <b>ตั้งค่า (Settings) → Messaging API</b> → กด{" "}
            <b>Enable / ใช้งาน Messaging API</b> (เลือกหรือสร้าง Provider)
          </li>
          <li>
            เข้า{" "}
            <a
              href="https://developers.line.biz/console/"
              target="_blank"
              rel="noreferrer"
            >
              LINE Developers Console
            </a>{" "}
            → เลือก Provider → เลือก Channel ที่เพิ่งสร้าง
          </li>
          <li>
            แท็บ <b>Basic settings</b> → คัดลอก <b>Channel secret</b>
          </li>
          <li>
            แท็บ <b>Messaging API</b> → หัวข้อ{" "}
            <b>Channel access token (long-lived)</b> → กด <b>Issue</b> → คัดลอก
            token
          </li>
          <li>
            เอา 2 ค่านั้นมากรอกในฟอร์ม <b>“เชื่อม LINE OA”</b> ด้านล่าง (Basic ID
            คือ @xxx ของ OA) แล้วกดบันทึก
          </li>
          <li>
            หลังบันทึก จะมี <b>Webhook URL</b> ขึ้นในตาราง “ช่องทางที่เชื่อมแล้ว”
            → คัดลอกไปวางในแท็บ Messaging API ช่อง <b>Webhook URL</b> → กด{" "}
            <b>Verify</b> แล้วเปิด <b>Use webhook</b>
          </li>
          <li>
            ปิด <b>Auto-reply</b> และ <b>Greeting message</b> ใน OA
            เพื่อให้บอทเราตอบแทน
          </li>
        </ol>
      </details>

      <details className="guide">
        <summary>🔵 วิธีเชื่อม Facebook (Messenger)</summary>
        <ol>
          <li>
            เข้า{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noreferrer"
            >
              Meta for Developers
            </a>{" "}
            → Create App → ประเภท <b>Business</b> → เพิ่ม Product{" "}
            <b>Messenger</b>
          </li>
          <li>
            App Settings → Basic → คัดลอก <b>App Secret</b>{" "}
            (ให้แอดมินระบบตั้งเป็น <code className="url">META_APP_SECRET</code>{" "}
            — ทำครั้งเดียว)
          </li>
          <li>
            Messenger → Settings → เลือกเพจของร้าน → <b>Generate Access Token</b>{" "}
            → คัดลอก <b>Page Access Token</b>
          </li>
          <li>
            เอา <b>Page ID</b> (ดูได้ในหน้า About ของเพจ) + Token มากรอกในฟอร์ม{" "}
            <b>“เชื่อม Facebook Page”</b> ด้านล่าง
          </li>
          <li>
            หลังบันทึก คัดลอก <b>Webhook URL</b> ที่ขึ้น → Messenger → Webhooks →
            Callback URL, ใส่ Verify Token =
            <code className="url">META_VERIFY_TOKEN</code> → Subscribe ฟิลด์{" "}
            <b>messages</b>
          </li>
          <li>
            ก่อนใช้กับลูกค้าจริงต้องผ่าน <b>Business Verification + App Review</b>{" "}
            (pages_messaging) — เผื่อเวลาหลายสัปดาห์
          </li>
        </ol>
      </details>

      <p className="muted" style={{ fontSize: "0.82rem", marginBottom: 0 }}>
        Webhook URL ของร้านนี้จะเป็นรูปแบบ{" "}
        <code className="url">{webhookBase}/api/webhooks/line/&lt;id&gt;</code> —
        จะเห็นค่าจริงหลังกดเชื่อมช่องทาง
      </p>
    </div>
  );
}
