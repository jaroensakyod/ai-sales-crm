# Deploy + เชื่อมช่องทางจริง

คู่มือนำระบบขึ้น production (Vercel) และเชื่อม LINE/Facebook/Payment จริง
โค้ดทั้งหมดพร้อมแล้ว — ขั้นตอนต่อไปนี้เป็นการตั้งค่าบริการภายนอก

## 0. ก่อนเริ่ม — ตรวจว่ารันในเครื่องได้

```bash
npm install && npm run build && npm test
```

## 1. ฐานข้อมูล (Supabase)

ทำตาม [05-db-setup.md](05-db-setup.md) → ได้ `DATABASE_URL` (transaction pooler :6543)
รัน migration ครั้งแรก: `npm run db:migrate`

## 2. Gemini API

เปิด billing (ห้าม free tier — 15 RPM ไม่พอ) → ได้ `GEMINI_API_KEY`
ระบบใช้ model alias `gemini-flash-lite-latest` (ค่าเริ่มต้น) / `gemini-flash-latest` (escalate)
และ `gemini-embedding-001` (RAG, 768 มิติ) — ทั้งหมด track เวอร์ชันล่าสุดเอง

## 3. Environment variables (ตั้งใน Vercel Project Settings → Environment Variables)

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase pooler :6543 |
| `GEMINI_API_KEY` | ✅ | เปิด billing |
| `TOKEN_ENCRYPTION_KEY` | ✅ | 32-byte base64 — `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DASHBOARD_PASSWORD` | แนะนำ | รหัสเข้าแดชบอร์ด (ว่าง = เปิดสาธารณะ) |
| `CRON_SECRET` | แนะนำ | กัน cron ถูกยิงจากภายนอก |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | – | ไม่ต้อง — token ต่อ OA เก็บใน DB ผ่านหน้า Settings |
| `META_APP_SECRET` | ✅ (ถ้าใช้ FB) | app secret สำหรับ verify signature (app-level) |
| `META_VERIFY_TOKEN` | ✅ (ถ้าใช้ FB) | token สำหรับ webhook verify handshake |
| `PAYMENT_WEBHOOK_SECRET` | ถ้าใช้ payment | Bearer secret ของ payment callback |

> ⚠️ อย่า commit `.env` — มันถูก gitignore แล้ว

## 4. Deploy ขึ้น Vercel

1. Import repo เข้า Vercel (ต้องเป็น **Pro** — `vercel.json` ตั้ง cron ทุก 15 นาที)
2. ตั้ง env ตามตารางข้อ 3
3. Deploy — Vercel จะ build อัตโนมัติ
4. หลัง deploy ครั้งแรก รัน migration กับ production DB (จากเครื่อง โดยชี้ `DATABASE_URL` ไป production): `npm run db:migrate`

Cron `/api/cron/followups` จะรันเองตาม `vercel.json` — Vercel ส่ง header `Authorization: Bearer $CRON_SECRET`

## 5. เชื่อม LINE OA

1. สร้าง LINE Official Account → เปิด **Messaging API** ผ่าน [LINE OA Manager](https://manager.line.biz)
   (Console สร้าง channel ตรงไม่ได้แล้วตั้งแต่ ก.ย. 2024)
2. เอา **Channel secret** + **Channel access token** จาก LINE Developers Console
3. ในแดชบอร์ด → ร้าน → **ตั้งค่า** → กรอกฟอร์ม "เชื่อม LINE OA" (token จะถูกเข้ารหัสเก็บใน DB)
4. คัดลอก **Webhook URL** ที่แสดง (`https://<app>/api/webhooks/line/<channelId>`) ไปวางใน LINE Developers → Messaging API → Webhook URL แล้วกด **Verify** + เปิด **Use webhook**
5. ปิด auto-reply/greeting ของ LINE เพื่อให้บอทเราตอบแทน

## 6. เชื่อม Facebook Messenger

1. สร้าง Meta App ([developers.facebook.com](https://developers.facebook.com)) → เพิ่ม **Messenger** product
2. เอา **App Secret** → ตั้งเป็น `META_APP_SECRET`; ตั้ง `META_VERIFY_TOKEN` เป็นค่าอะไรก็ได้ที่จำได้
3. Generate **Page Access Token** ของเพจ
4. ในแดชบอร์ด → ตั้งค่า → ฟอร์ม "เชื่อม Facebook Page" (Page ID + Page Access Token)
5. Meta App → Messenger → Webhooks → Callback URL = `https://<app>/api/webhooks/facebook/<channelId>`,
   Verify Token = `META_VERIFY_TOKEN` → Subscribe field **messages**
6. **ก่อนขายลูกค้าจริง** ต้องผ่าน Business Verification + App Review (`pages_messaging` Advanced Access) — เผื่อเวลาหลายสัปดาห์ (risk #10)

## 7. Payment (Phase 2)

ยังไม่ผูก gateway จริง — endpoint `/api/webhooks/payment` พร้อมรับ callback:
`POST { paymentId, event: "charge.complete" }` + header `Authorization: Bearer $PAYMENT_WEBHOOK_SECRET`
→ ยืนยัน payment → order เป็น PAID (order ไม่มีทางเป็น PAID ด้วยวิธีอื่น — risk #9)
ต่อ Omise/2C2P จริงโดย map webhook ของ provider มาเรียก endpoint นี้ (แทนที่ signature check ด้วย HMAC ของ provider)

## 8. ตรวจหลัง deploy

- `GET /api/health` → `{"status":"ok"}`
- เปิด `/dashboard` → login → เปิดร้าน → เชื่อม LINE → ทักเข้า OA จริง → บอทตอบ
- ถามราคาสินค้าที่ seed ไว้ → ได้ราคาจาก DB (L1)
- อัปโหลด knowledge แล้วถาม FAQ → ตอบจาก RAG (L2)
- ดูบทสนทนา/ต้นทุน AI ในแดชบอร์ด

## ยังเหลือ (นอกโค้ด)

- Meta Business Verification + App Review
- เชื่อม Omise/2C2P จริง + recurring billing
- per-user login จริง (ตอนนี้ใช้ `DASHBOARD_PASSWORD` รวม — role matrix พร้อมต่อแล้ว)
- ที่ปรึกษา PDPA ตรวจเนื้อหา DPA/T&C จริง
