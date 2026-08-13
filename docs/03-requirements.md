# สิ่งที่ต้องมี/ต้องสมัครก่อนเริ่มสร้างจริง

## บัญชี/บริการที่ต้องสมัคร

| บริการ | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|
| Vercel (แผน Pro, $20/เดือน/seat) | Deploy ทั้งระบบ | Hobby ใช้ไม่ได้เพราะ cron รันได้แค่วันละครั้ง ไม่พอสำหรับ Follow-up Engine |
| Supabase (project ใหม่แยกจาก bazi-sft-dataset) | Postgres + pgvector + connection pooler | เริ่ม compute tier เล็กสุดได้ อัปทีหลังตามจำนวน tenant |
| Google AI Studio / Gemini API (เปิด billing ตั้งแต่แรก) | LLM หลัก | **ห้ามอยู่ free tier** (15 RPM เท่านั้น) ต้องเปิด billing ให้ได้ Tier 1 ขึ้นไป (150-300 RPM) |
| Meta for Developers — สร้าง App ใหม่ | Facebook Messenger integration | เริ่มทดสอบกับ Page ตัวเองได้ทันที ไม่ต้องรอ review — แต่ก่อนขายลูกค้าจริงต้องผ่าน Business Verification + App Review (`pages_messaging` Advanced Access) |
| LINE Developers Console + LINE Official Account Manager | LINE Messaging API | ต้องสร้าง LINE OA ก่อน แล้วเปิดใช้ Messaging API ผ่าน OA Manager (Console สร้าง channel ตรงไม่ได้แล้วตั้งแต่ ก.ย. 2024) |
| Omise (Opn Payments) หรือ 2C2P | เก็บเงินค่าสมาชิกรายเดือนจากร้านค้า (Phase 2) | ยังไม่ต้องสมัครใน Phase 1 (ใช้กับร้านตัวเอง ไม่ต้องเก็บเงินใคร) |
| ที่ปรึกษา/ทนาย PDPA | ร่างเอกสาร DPA (Data Processing Agreement) + T&C | ต้องมีก่อนเปิดขายลูกค้าจริง (Phase 2) — เราช่วยเขียน flow ให้แต่เนื้อหาสัญญาต้องผู้เชี่ยวชาญตรวจ |

## DB Schema ตั้งต้น (ขั้นต่ำ)

```
tenants, users, roles
channels, facebook_connections, line_connections
customers, customer_identities, conversations, messages
customer_memories, leads, lead_events, sales_stages, objections
products, product_variants, cross_sells, promotions
orders, order_items, payments
knowledge_documents, knowledge_chunks, knowledge_gaps
followups, automation_rules
tenant_ai_settings, ai_runs, usage_events
tenant_agreements (PDPA/T&C consent log)
audit_logs
```

ทุกตาราง (ยกเว้น `tenants` เอง) ต้องมี `tenant_id` — ทุก query ต้อง `WHERE tenant_id = currentTenant` ไม่มีข้อยกเว้น

## งบประมาณ AI (API)

ประมาณการต้นทุน Gemini ต่อร้าน/เดือน (สมมติ Message Router กรองแล้วเหลือ ~35% ของข้อความที่ต้องเรียก AI จริง):

| ขนาดร้าน | ข้อความ/เดือน | เรียก AI จริง | Flash-Lite (เลือกใช้) | Flash มาตรฐาน (เฉพาะ Level 3) |
|---|---|---|---|---|
| เล็ก | 800 | ~280 ครั้ง | ~1.8 บาท | ~34 บาท |
| กลาง | 3,000 | ~1,050 ครั้ง | ~6.9 บาท | ~127 บาท |
| ใหญ่ | 10,000 | ~3,500 ครั้ง | ~23 บาท | ~423 บาท |

ต้นทุนคิดเป็นสัดส่วนน้อยมากเทียบกับราคาขายที่เสนอไว้ (Starter 199-299 / Pro 599-799 บาท/เดือน) — มี margin เหลือเยอะ แม้จะ escalate ไปโมเดลมาตรฐานบ่อยกว่าที่คาด

## ตัวเลือกราคาที่เสนอ (เทียบกับ ZWIZ.AI ที่เริ่ม 500 บาท/เดือนแบบมีโควตา)

```
Starter — 199-299 บาท/เดือน
1 Channel, ไม่จำกัดข้อความ, สินค้าไม่จำกัด, Knowledge upload, สรุปยอด/Lead รายเดือน

Pro — 599-799 บาท/เดือน
FB+LINE พร้อมกัน/หลาย Page, Follow-up อัตโนมัติ+Cross-sell,
Lead Scoring+Pipeline, Analytics เต็ม+Objection breakdown
```

จุดขาย: **"ไม่จำกัดข้อความ"** (มี soft-cap ภายในเป็น safety net เท่านั้น ไม่บอกลูกค้า — ดู 04-risks.md)

## ไลบรารีที่ต้องเพิ่ม (นอกเหนือจาก stack เดิม)

- `officeParser` หรือ `office-text-extractor` — parse PDF/DOCX/XLSX สำรอง (กรณี Gemini native ไม่พอ)
- Client SDK ของ Omise/2C2P (Phase 2)
- SDK Facebook Graph API / Messenger Platform
