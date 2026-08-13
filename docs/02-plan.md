# แผนงาน (Roadmap)

## สถาปัตยกรรมหลัก

```
Facebook Messenger ─┐
                     ├──> Channel Adapter ──> AI SALES CORE ──┐
LINE OA ─────────────┘                                        │
                                          ┌─────────┬─────────┼─────────┐
                                          ↓         ↓         ↓         ↓
                                     Knowledge     CRM   Sales Engine  Analytics
                                        (RAG)   (Customer   (Lead/       │
                                                  Memory)  Pipeline/   ทุกตารางมี
                                                          Objection)   tenant_id
```

หลักการ: **Channel ไม่ใช่ Core** (Facebook/LINE เป็นแค่ adapter), **AI ไม่ใช่ Database** (ราคา/สต็อก/ออเดอร์ต้องอ่านจาก DB สด ไม่ใช่ให้ AI จำ), **Multi-tenant ตั้งแต่วันแรก** แม้ tenant แรกจะเป็นร้านของเราเอง

## Message Router — หัวใจของการคุมต้นทุนและความเสถียร

```
ข้อความลูกค้าเข้ามา
      ↓
Level 1: Exact/Rule-based (ราคา, เวลาเปิด-ปิด, สต็อก) → ตอบจาก DB ตรงๆ ไม่เรียก AI
      ↓
Level 2: Search/Knowledge (คำถามเทียบสเปค) → ค้น RAG ก่อน
      ↓
Level 3: AI Reasoning (เปรียบเทียบ+แนะนำตามงบ/ความต้องการ) → เรียก Gemini
      ↓
Level 4: Human Handoff (คืนเงิน, ข้อพิพาท, AI confidence ต่ำ) → ส่ง Human Inbox
```

ประโยชน์คู่: **คุมต้นทุน AI** + **กันระบบล่มพร้อมกันหมดถ้า Gemini ล่ม** (Level 1-2 ยังตอบได้แม้ Gemini down)

## Phase 1 — MVP (ใช้กับร้านของเราเองก่อน)

เป้าหมาย: ร้านหนึ่งเชื่อม Facebook + LINE แล้ว AI รับลูกค้า ตอบจากข้อมูลร้าน เก็บ Lead และช่วยปิด Order ได้

**Data model ที่ต้องมีตั้งแต่ตารางแรก** (ดูรายละเอียด schema ใน [03-requirements.md](03-requirements.md#db-schema-ตั้งต้น)):
- `tenants`, `users` (role: OWNER/ADMIN/SALES/SUPPORT/VIEWER)
- `channels` (type: MESSENGER/LINE, ไม่ผูก business logic ตรงกับ channel)
- `facebook_connections` / `line_connections` (encrypted token ต่อ page/OA, ไม่ใช่ env var)
- `customers` (scope ด้วย `channel_id + external_id` ก่อน merge เป็น identity เดียว)
- `conversations`, `messages` (แยก `direction`, มี field จัดประเภท transactional/promotional)
- `products` + `cross_sells` (ตารางจับคู่สินค้าที่เข้ากัน — ไม่ให้ AI เดาเอง)
- `knowledge_documents/chunks` (RAG)
- `leads`, `sales_stages`, `objections`
- `orders`, `order_items`
- `followups` (queue กลาง ไม่ผูก channel)
- `usage_events` (metering AI cost ต่อ tenant)
- `tenant_agreements` (log การกด accept DPA/T&C — ดู risk #3)

**Onboarding flow:**
```
1. สมัคร/สร้างร้าน + accept DPA (click-to-accept, log consent)
2. เลือกประเภทธุรกิจ (Catalog/Booking/Course — เลือกได้หลายข้อ)
3. อัปโหลดข้อมูลร้าน (text วาง / PDF / Word / Excel)
   → AI แยกเป็น "โครงสร้าง" (ราคา/สต็อก) vs "ความรู้ทั่วไป" (FAQ)
   → หน้ายืนยันก่อนเข้าระบบจริง (กันข้อมูลสกปรก/ขัดแย้งกัน)
4. เชื่อม Facebook (Embedded Signup v4) และ/หรือ LINE (ลิงก์แนะนำ + วาง token + ทดสอบเชื่อมต่อ)
5. ตั้ง Sales Rules (AI ทำอะไรได้/ไม่ได้, discount authority = 0 บาทเป็นค่าเริ่มต้น)
6. Test AI → Activate
```

**Follow-up Engine ต้องแยกประเภทข้อความตั้งแต่ออกแบบ** (ผูกกับ risk #1 ใน 04-risks.md):
```
Trigger fires → เช็คว่าลูกค้าทักมาใน 24 ชม.ล่าสุดไหม
  → ใช่ = ตอบ/เสนอได้อิสระ
  → ไม่ = เช็คเนื้อหา: สถานะออเดอร์ (ส่งได้ผ่าน tag) vs เสนอขาย (ต้องผ่าน LINE broadcast หรือ FB opt-in)
```

Default ช่องทาง follow-up/cross-sell = **LINE** (merchant setup ง่ายกว่า ไม่ต้องผ่าน Meta review)

## Phase 2 — เปิดขายให้ร้านอื่น (SaaS จริง)

- Facebook Business Verification + App Review (ขอ `pages_messaging` แบบ Advanced Access) — ใช้เวลาหลายสัปดาห์ เผื่อ buffer
- Payment gateway (Omise/2C2P) สำหรับเก็บค่าสมาชิกรายเดือนแบบ recurring
- Multi-page UI, Team/Roles เต็มรูปแบบ
- Knowledge Gap Inbox (คำถามที่ AI ตอบไม่ได้ → admin ตอบครั้งเดียว → ฉลาดขึ้นเรื่อยๆ)
- AI Cost Dashboard ต่อ tenant + soft-cap แบบ graceful overage (ไม่บล็อกลูกค้ากลางบทสนทนา)

## Phase 3 — ขยาย Business Type + Channel

- เพิ่ม Instagram/TikTok/WhatsApp Adapter (ใช้ Channel Abstraction เดิม)
- เพิ่ม field เฉพาะ vertical ที่ยังไม่ครอบคลุม (เช่น ผูก PMS สำหรับโรงแรมที่โตขึ้น)
- Meta Marketing Messages (สำหรับร้านที่มีแต่ FB อย่างเดียว ต้องการ cross-sell แบบ opt-in)

## Phase 4 — AI Commerce Platform เต็มรูปแบบ

AI Sales Agent / AI Support Agent / AI Follow-up Agent / AI Product Advisor / AI Sales Analyst

## Stack ที่เลือก

| ส่วน | เลือกใช้ | เหตุผล |
|---|---|---|
| Framework | Next.js + TypeScript, deploy Vercel Pro | pattern เดียวกับ bazi-sft-dataset, ทีมคุ้นเคย |
| DB | Postgres (Supabase transaction pooler) + Drizzle ORM | reuse `createDbSqlClient` pattern เดิม |
| RAG | pgvector บน Supabase ตัวเดียวกัน | ไม่ต้องมี vector DB แยก |
| AI | Gemini API — **Flash-Lite เป็นค่าเริ่มต้น** escalate เป็น Flash เฉพาะ Level 3 | คุณภาพพอ + ถูกที่สุด (ดูตารางต้นทุนใน 03-requirements.md) |
| Document ingestion | Gemini native PDF/image understanding เป็นหลัก, officeParser สำรองสำหรับ DOCX/XLSX | ลด pipeline OCR แยกต่างหาก |
| Payment | Omise หรือ 2C2P | รองรับ PromptPay + recurring billing ในตัว |
| LINE | `@line/bot-sdk` (pattern เดียวกับ `src/features/line-chat/` เดิม) | proven pattern อยู่แล้ว |
