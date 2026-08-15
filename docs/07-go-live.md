# Go-live checklist

Repo: **https://github.com/jaroensakyod/ai-sales-crm** (private) — CI runs
lint + typecheck + test + build on every push.

## 1. Deploy to Vercel (≈5 นาที)

1. เข้า https://vercel.com → **Add New → Project** → Import `jaroensakyod/ai-sales-crm`
   (ต้องเชื่อม GitHub กับ Vercel ก่อน)
2. Framework ตรวจเป็น **Next.js** อัตโนมัติ — ไม่ต้องแก้ build settings
3. ต้องเป็นแผน **Vercel Pro** (cron ใน `vercel.json` รันทุก 15 นาที — Hobby รันได้แค่วันละครั้ง)
4. ใส่ **Environment Variables** (ข้อ 2) แล้วกด **Deploy**

## 2. Environment Variables (Vercel → Project → Settings → Environment Variables)

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler `:6543` (ตัวเดียวกับ local ก็ได้ — ตารางถูก migrate แล้ว) |
| `GEMINI_API_KEY` | key เดิม (เปิด billing แล้ว) |
| `TOKEN_ENCRYPTION_KEY` | **ต้องเป็นค่าเดียวกับ local** ถ้าใช้ Supabase ตัวเดิม (ไม่งั้น token ที่เข้ารหัสไว้ถอดไม่ออก) |
| `SESSION_SECRET` | สุ่มใหม่ (ผมให้ค่ามาแล้ว) |
| `CRON_SECRET` | สุ่มใหม่ (กัน cron ถูกยิงจากภายนอก) |
| `PAYMENT_WEBHOOK_SECRET` | สุ่มใหม่ |
| `DASHBOARD_PASSWORD` | ตั้งรหัสสำหรับหน้า super-admin (`/dashboard`, `/dashboard/new`) |
| `META_APP_SECRET` / `META_VERIFY_TOKEN` | ใส่เมื่อจะเชื่อม Facebook |
| `AUTH_ENABLED` | ตั้ง `1` เมื่อพร้อมบังคับ login ทีมงานรายบุคคล (ค่าเริ่มต้น: เปิดโล่ง) |

> ค่าสุ่ม `SESSION_SECRET` / `CRON_SECRET` / `PAYMENT_WEBHOOK_SECRET` ผมสร้างให้แล้วในแชท —
> คัดลอกไปใส่ได้เลย (เก็บเป็นความลับ)

## 3. หลัง deploy ครั้งแรก

- ถ้าใช้ Supabase ตัวใหม่ (ไม่ใช่ตัว local) → รัน migration ใส่ DB prod:
  ```bash
  DATABASE_URL="<prod-url>" npm run db:migrate
  ```
  (ถ้าใช้ตัวเดิม ข้ามได้ — migrate แล้ว)
- ทดสอบ: เปิด `https://<app>.vercel.app/api/ready` → ควรได้ `{"status":"ready","db":"ok"}`

## 4. เชื่อมช่องทางจริง

เปิด `https://<app>.vercel.app/dashboard` → เข้าร้าน → **ตั้งค่า** → มีคู่มือทีละขั้นในหน้าเว็บ
(LINE: OA Manager → Developers Console → คัดลอก secret+token → วาง → เอา Webhook URL ไปตั้ง)

## 5. ก่อนขายลูกค้าจริง (external, เผื่อเวลา)

- Meta Business Verification + App Review (`pages_messaging`) — หลายสัปดาห์
- ทนาย PDPA ตรวจเนื้อหา DPA/T&C จริง
- (ทางเลือก) ต่อ SlipOK / Omise / 2C2P สำหรับตรวจสลิป/ตัดเงินจริง

## 6. คำสั่งดูแลระบบ

```bash
npm run db:seed        # สร้างร้านตัวอย่าง (dev)
gh run list            # ดูสถานะ CI
```
